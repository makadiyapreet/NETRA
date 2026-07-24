"""
Graph ETL: loads classified posts, bot scores, and duplicate clusters into Neo4j.

Works in fixture mode (reads from fixture JSON files) or kafka mode.
Creates Account, Post, and Cluster nodes with appropriate relationships.
Idempotent: safe to re-run on the same data via MERGE operations.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)


class GraphETL:
    """
    ETL pipeline for loading threat analysis data into Neo4j.

    Creates:
      - Account nodes with bot scores
      - Post nodes with classification data
      - POSTED, MENTIONED, DUPLICATE_OF, SHARED_DUPLICATE relationships
    """

    def __init__(
        self,
        neo4j_uri: str = "bolt://localhost:7687",
        neo4j_user: str = "neo4j",
        neo4j_password: str = "netra",
    ):
        self.neo4j_uri = neo4j_uri
        self.neo4j_user = neo4j_user
        self.neo4j_password = neo4j_password
        self._driver = None

    def connect(self) -> None:
        """Establish connection to Neo4j."""
        try:
            from neo4j import GraphDatabase

            self._driver = GraphDatabase.driver(
                self.neo4j_uri, auth=(self.neo4j_user, self.neo4j_password)
            )
            # Verify connectivity
            self._driver.verify_connectivity()
            logger.info(f"Connected to Neo4j at {self.neo4j_uri}")
        except Exception as e:
            logger.error(f"Failed to connect to Neo4j: {e}")
            raise

    def close(self) -> None:
        """Close Neo4j connection."""
        if self._driver:
            self._driver.close()
            logger.info("Neo4j connection closed")

    def init_schema(self) -> None:
        """Run schema initialization (constraints and indexes)."""
        schema_path = Path(__file__).parent / "neo4j_schema.cypher"

        if not schema_path.exists():
            logger.warning(f"Schema file not found: {schema_path}")
            return

        with open(schema_path) as f:
            cypher_content = f.read()

        # Split into individual statements (skip comments and empty lines)
        statements = []
        for line in cypher_content.split(";"):
            line = line.strip()
            # Remove comment-only lines
            cleaned = "\n".join(
                l for l in line.split("\n") if not l.strip().startswith("//")
            ).strip()
            if cleaned:
                statements.append(cleaned)

        with self._driver.session() as session:
            for stmt in statements:
                try:
                    session.run(stmt)
                except Exception as e:
                    logger.warning(f"Schema statement skipped: {e}")

        logger.info(f"Schema initialized ({len(statements)} statements)")

    def load_posts_and_accounts(
        self,
        posts: list[dict[str, Any]],
        classifications: list[dict[str, Any]],
        bot_scores: list[dict[str, Any]],
    ) -> dict[str, int]:
        """
        Load posts, accounts, and their relationships into Neo4j.

        Args:
            posts: Original post data (from sample_posts.json).
            classifications: Classification results (from sample_classified_output.json).
            bot_scores: Bot score results for each account.

        Returns:
            Dict with counts of created nodes and relationships.
        """
        cls_lookup = {c["post_id"]: c for c in classifications}
        bot_lookup = {b["account_id"]: b for b in bot_scores}

        stats = {"accounts": 0, "posts": 0, "posted_rels": 0, "mentioned_rels": 0}

        with self._driver.session() as session:
            for post in posts:
                author_id = post["author_id"]
                post_id = post["post_id"]

                # Upsert Account node
                bot_data = bot_lookup.get(author_id, {})
                session.run(
                    """
                    MERGE (a:Account {account_id: $account_id})
                    SET a.handle = $handle,
                        a.bot_likelihood = $bot_likelihood,
                        a.follower_count = $follower_count,
                        a.following_count = $following_count,
                        a.account_created_at = $account_created_at
                    """,
                    account_id=author_id,
                    handle=post.get("author_handle", ""),
                    bot_likelihood=bot_data.get("bot_likelihood", 0.0),
                    follower_count=post.get("raw_payload", {}).get("follower_count", 0),
                    following_count=post.get("raw_payload", {}).get("following_count", 0),
                    account_created_at=post.get("raw_payload", {}).get("account_created_at", ""),
                )
                stats["accounts"] += 1

                # Upsert Post node
                cls_data = cls_lookup.get(post_id, {})
                session.run(
                    """
                    MERGE (p:Post {post_id: $post_id})
                    SET p.platform = $platform,
                        p.text = $text,
                        p.created_at = $created_at,
                        p.threat_category = $threat_category,
                        p.threat_confidence = $threat_confidence,
                        p.sentiment = $sentiment,
                        p.detected_language = $detected_language
                    """,
                    post_id=post_id,
                    platform=post.get("platform", ""),
                    text=post.get("text", "")[:500],  # Truncate for storage
                    created_at=post.get("created_at", ""),
                    threat_category=cls_data.get("threat_category", "Neutral"),
                    threat_confidence=cls_data.get("threat_confidence", 0.0),
                    sentiment=cls_data.get("sentiment", "neutral"),
                    detected_language=cls_data.get("detected_language", "en"),
                )
                stats["posts"] += 1

                # POSTED relationship
                session.run(
                    """
                    MATCH (a:Account {account_id: $author_id})
                    MATCH (p:Post {post_id: $post_id})
                    MERGE (a)-[:POSTED]->(p)
                    """,
                    author_id=author_id,
                    post_id=post_id,
                )
                stats["posted_rels"] += 1

                # MENTIONED relationships
                for mention in post.get("mentions", []):
                    mention_clean = mention.lstrip("@")
                    if mention_clean:
                        session.run(
                            """
                            MERGE (mentioned:Account {account_id: $mention_id})
                            ON CREATE SET mentioned.handle = $mention_handle
                            WITH mentioned
                            MATCH (author:Account {account_id: $author_id})
                            MERGE (author)-[:MENTIONED {in_post: $post_id}]->(mentioned)
                            """,
                            mention_id=f"mention_{mention_clean}",
                            mention_handle=mention,
                            author_id=author_id,
                            post_id=post_id,
                        )
                        stats["mentioned_rels"] += 1

        logger.info(f"Loaded into Neo4j: {stats}")
        return stats

    def load_duplicate_clusters(
        self,
        clusters: list[dict[str, Any]],
    ) -> int:
        """
        Load near-duplicate relationships into Neo4j.

        Creates DUPLICATE_OF relationships between posts and
        SHARED_DUPLICATE relationships between their authors.

        Args:
            clusters: List of duplicate cluster dicts from near_duplicate.py.

        Returns:
            Number of relationships created.
        """
        rel_count = 0

        with self._driver.session() as session:
            for cluster in clusters:
                post_ids = cluster.get("post_ids", [])
                similarity = cluster.get("similarity", 0.0)

                # Create pairwise DUPLICATE_OF between posts
                for i in range(len(post_ids)):
                    for j in range(i + 1, len(post_ids)):
                        session.run(
                            """
                            MATCH (p1:Post {post_id: $pid1})
                            MATCH (p2:Post {post_id: $pid2})
                            MERGE (p1)-[:DUPLICATE_OF {similarity: $sim}]->(p2)
                            """,
                            pid1=post_ids[i],
                            pid2=post_ids[j],
                            sim=similarity,
                        )
                        rel_count += 1

                # Create SHARED_DUPLICATE between authors
                author_ids = cluster.get("author_ids", [])
                unique_authors = list(set(author_ids))
                for i in range(len(unique_authors)):
                    for j in range(i + 1, len(unique_authors)):
                        session.run(
                            """
                            MATCH (a1:Account {account_id: $aid1})
                            MATCH (a2:Account {account_id: $aid2})
                            MERGE (a1)-[:SHARED_DUPLICATE]->(a2)
                            """,
                            aid1=unique_authors[i],
                            aid2=unique_authors[j],
                        )

        logger.info(f"Loaded {rel_count} duplicate relationships")
        return rel_count

    def run_fixture_etl(
        self,
        posts_path: str | Path,
        classifications_path: str | Path,
        bot_scores: Optional[list[dict]] = None,
        duplicate_clusters: Optional[list[dict]] = None,
    ) -> dict:
        """
        Run the full ETL pipeline from fixture files.

        Args:
            posts_path: Path to sample_posts.json.
            classifications_path: Path to sample_classified_output.json.
            bot_scores: Pre-computed bot scores (computed inline if None).
            duplicate_clusters: Pre-computed duplicate clusters.

        Returns:
            Summary stats dict.
        """
        # Load data
        with open(posts_path) as f:
            posts = json.load(f)
        with open(classifications_path) as f:
            classifications = json.load(f)

        # Compute bot scores if not provided
        if bot_scores is None:
            from network_analysis.bot_detection.heuristic_scorer import compute_bot_score

            bot_scores = []
            seen_accounts: set[str] = set()
            for post in posts:
                aid = post["author_id"]
                if aid not in seen_accounts:
                    seen_accounts.add(aid)
                    score = compute_bot_score(
                        account_id=aid,
                        raw_payload=post.get("raw_payload", {}),
                        engagement_counts=post.get("engagement_counts"),
                    )
                    bot_scores.append({
                        "account_id": score.account_id,
                        "bot_likelihood": score.bot_likelihood,
                        "signals": score.signals,
                    })

        # Compute duplicate clusters if not provided
        if duplicate_clusters is None:
            from network_analysis.bot_detection.near_duplicate import find_duplicates

            dup_result = find_duplicates(posts)
            duplicate_clusters = [
                {
                    "cluster_id": c.cluster_id,
                    "post_ids": list(c.post_ids),
                    "author_ids": list(c.author_ids),
                    "similarity": c.similarity,
                }
                for c in dup_result.clusters
            ]

        # Initialize schema
        self.init_schema()

        # Load data
        stats = self.load_posts_and_accounts(posts, classifications, bot_scores)
        dup_count = self.load_duplicate_clusters(duplicate_clusters)
        stats["duplicate_rels"] = dup_count

        return stats


# ── CLI Entry Point ─────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys

    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

    from network_analysis.config import get_config

    config = get_config()

    etl = GraphETL(
        neo4j_uri=config.neo4j_uri,
        neo4j_user=config.neo4j_user,
        neo4j_password=config.neo4j_password,
    )

    etl.connect()
    try:
        stats = etl.run_fixture_etl(
            posts_path=config.sample_posts_path,
            classifications_path=config.classified_output_path,
        )
        print(f"\n✅ ETL complete: {stats}")
    finally:
        etl.close()

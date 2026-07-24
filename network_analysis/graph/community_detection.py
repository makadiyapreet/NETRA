"""
Community detection and coordination analysis using Neo4j Graph Data Science.

Runs:
  1. Louvain community detection → assigns community IDs to accounts
  2. PageRank → identifies influential accounts
  3. Betweenness centrality → identifies bridge accounts
  4. Coordination scoring → computes per-community coordination score
  5. Alert generation → emits alerts for suspicious communities

Outputs alerts to Kafka "alerts" topic or fixtures/sample_alerts_output.json.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)


class CommunityDetector:
    """
    Runs graph algorithms on the coordination network to detect
    bot clusters and coordinated campaigns.
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
        self._gds = None
        self._driver = None

    def connect(self) -> None:
        """Connect to Neo4j using the GDS Python client."""
        try:
            from graphdatascience import GraphDataScience

            self._gds = GraphDataScience(
                self.neo4j_uri, auth=(self.neo4j_user, self.neo4j_password)
            )
            logger.info(f"Connected to Neo4j GDS at {self.neo4j_uri}")

            # Also create a raw driver for custom queries
            from neo4j import GraphDatabase

            self._driver = GraphDatabase.driver(
                self.neo4j_uri, auth=(self.neo4j_user, self.neo4j_password)
            )

        except Exception as e:
            logger.error(f"Failed to connect to Neo4j GDS: {e}")
            raise

    def close(self) -> None:
        """Close connections."""
        if self._driver:
            self._driver.close()

    def _project_graph(self, graph_name: str = "coordination_graph") -> Any:
        """
        Project the coordination graph into GDS memory.

        Projects Account nodes connected by MENTIONED and SHARED_DUPLICATE relationships.
        """
        # Drop existing projection if it exists
        try:
            if self._gds.graph.exists(graph_name).iloc[0]:
                self._gds.graph.drop(self._gds.graph.get(graph_name))
                logger.info(f"Dropped existing graph projection '{graph_name}'")
        except Exception:
            pass

        try:
            G, result = self._gds.graph.project(
                graph_name,
                "Account",
                {
                    "MENTIONED": {"orientation": "UNDIRECTED"},
                    "SHARED_DUPLICATE": {"orientation": "UNDIRECTED"},
                },
            )
            logger.info(
                f"Projected graph '{graph_name}': "
                f"{result['nodeCount']} nodes, {result['relationshipCount']} relationships"
            )
            return G
        except Exception as e:
            logger.error(f"Graph projection failed: {e}")
            raise

    def run_louvain(self, G: Any) -> dict[str, int]:
        """
        Run Louvain community detection.

        Returns:
            Dict mapping account_id → community_id.
        """
        try:
            result = self._gds.louvain.mutate(G, mutateProperty="community")
            community_count = result.get("communityCount", 0)
            logger.info(f"Louvain detected {community_count} communities")

            # Read community assignments
            communities = {}
            with self._driver.session() as session:
                records = session.run(
                    "MATCH (a:Account) WHERE a.community IS NOT NULL "
                    "RETURN a.account_id AS account_id, a.community AS community"
                )
                for record in records:
                    communities[record["account_id"]] = record["community"]

            # If mutate didn't write back, try stream mode
            if not communities:
                stream_result = self._gds.louvain.stream(G)
                for _, row in stream_result.iterrows():
                    node_id = row.get("nodeId")
                    community_id = row.get("communityId")
                    # Resolve node name
                    with self._driver.session() as session:
                        rec = session.run(
                            "MATCH (a:Account) WHERE id(a) = $nid RETURN a.account_id AS aid",
                            nid=int(node_id),
                        ).single()
                        if rec:
                            communities[rec["aid"]] = int(community_id)

            return communities

        except Exception as e:
            logger.error(f"Louvain failed: {e}")
            return {}

    def run_pagerank(self, G: Any) -> dict[str, float]:
        """
        Run PageRank to identify influential accounts.

        Returns:
            Dict mapping account_id → pagerank score.
        """
        try:
            result = self._gds.pageRank.stream(G)
            pageranks = {}
            for _, row in result.iterrows():
                node_id = row.get("nodeId")
                score = row.get("score", 0.0)
                with self._driver.session() as session:
                    rec = session.run(
                        "MATCH (a:Account) WHERE id(a) = $nid RETURN a.account_id AS aid",
                        nid=int(node_id),
                    ).single()
                    if rec:
                        pageranks[rec["aid"]] = float(score)

            logger.info(f"PageRank computed for {len(pageranks)} accounts")
            return pageranks

        except Exception as e:
            logger.error(f"PageRank failed: {e}")
            return {}

    def run_betweenness(self, G: Any) -> dict[str, float]:
        """
        Run betweenness centrality to identify bridge accounts.

        Returns:
            Dict mapping account_id → centrality score.
        """
        try:
            result = self._gds.betweenness.stream(G)
            centrality = {}
            for _, row in result.iterrows():
                node_id = row.get("nodeId")
                score = row.get("score", 0.0)
                with self._driver.session() as session:
                    rec = session.run(
                        "MATCH (a:Account) WHERE id(a) = $nid RETURN a.account_id AS aid",
                        nid=int(node_id),
                    ).single()
                    if rec:
                        centrality[rec["aid"]] = float(score)

            logger.info(f"Betweenness centrality computed for {len(centrality)} accounts")
            return centrality

        except Exception as e:
            logger.error(f"Betweenness centrality failed: {e}")
            return {}

    def compute_coordination_scores(
        self,
        communities: dict[str, int],
    ) -> dict[int, dict[str, Any]]:
        """
        Compute coordination score for each community.

        Score factors:
          - Average bot_likelihood of members
          - Number of SHARED_DUPLICATE edges within the community
          - Community size (suspicious if > threshold)

        Returns:
            Dict mapping community_id → {score, accounts, signals}
        """
        from collections import defaultdict

        community_accounts: dict[int, list[str]] = defaultdict(list)
        for account_id, comm_id in communities.items():
            community_accounts[comm_id].append(account_id)

        scores: dict[int, dict[str, Any]] = {}

        for comm_id, accounts in community_accounts.items():
            if len(accounts) < 2:
                continue  # Single-member communities aren't coordinated

            # Get bot scores for members
            bot_scores = []
            with self._driver.session() as session:
                for aid in accounts:
                    rec = session.run(
                        "MATCH (a:Account {account_id: $aid}) RETURN a.bot_likelihood AS bot",
                        aid=aid,
                    ).single()
                    if rec and rec["bot"] is not None:
                        bot_scores.append(float(rec["bot"]))

            avg_bot = sum(bot_scores) / len(bot_scores) if bot_scores else 0.0

            # Count internal duplicate edges
            dup_count = 0
            with self._driver.session() as session:
                rec = session.run(
                    """
                    MATCH (a1:Account)-[:SHARED_DUPLICATE]-(a2:Account)
                    WHERE a1.account_id IN $aids AND a2.account_id IN $aids
                    AND id(a1) < id(a2)
                    RETURN count(*) AS cnt
                    """,
                    aids=accounts,
                ).single()
                if rec:
                    dup_count = int(rec["cnt"])

            # Coordination score
            size_factor = min(len(accounts) / 10.0, 1.0)
            dup_factor = min(dup_count / max(len(accounts), 1), 1.0)
            coord_score = 0.4 * avg_bot + 0.35 * dup_factor + 0.25 * size_factor
            coord_score = max(0.0, min(1.0, coord_score))

            scores[comm_id] = {
                "coordination_score": round(coord_score, 4),
                "accounts": accounts,
                "size": len(accounts),
                "avg_bot_likelihood": round(avg_bot, 4),
                "duplicate_edges": dup_count,
            }

        return scores

    def generate_alerts(
        self,
        coordination_scores: dict[int, dict[str, Any]],
        threshold: float = 0.6,
    ) -> list[dict[str, Any]]:
        """
        Generate alerts for communities exceeding the coordination threshold.

        Args:
            coordination_scores: From compute_coordination_scores().
            threshold: Minimum coordination score to trigger an alert.

        Returns:
            List of alert dicts matching alert_schema.json.
        """
        alerts: list[dict[str, Any]] = []
        now = datetime.now(timezone.utc).isoformat()

        for comm_id, data in coordination_scores.items():
            if data["coordination_score"] < threshold:
                continue

            # Get the most threatening post from this community
            representative_post_id = ""
            with self._driver.session() as session:
                rec = session.run(
                    """
                    MATCH (a:Account)-[:POSTED]->(p:Post)
                    WHERE a.account_id IN $aids
                    AND p.threat_category <> 'Neutral'
                    RETURN p.post_id AS pid, p.threat_category AS cat,
                           p.threat_confidence AS conf
                    ORDER BY p.threat_confidence DESC
                    LIMIT 1
                    """,
                    aids=data["accounts"],
                ).single()
                if rec:
                    representative_post_id = rec["pid"]

            if not representative_post_id and data["accounts"]:
                # Fall back to any post from the cluster
                with self._driver.session() as session:
                    rec = session.run(
                        """
                        MATCH (a:Account {account_id: $aid})-[:POSTED]->(p:Post)
                        RETURN p.post_id AS pid LIMIT 1
                        """,
                        aid=data["accounts"][0],
                    ).single()
                    if rec:
                        representative_post_id = rec["pid"]

            cluster_id = f"cluster-{comm_id:04d}"
            severity = min(5, max(1, int(data["coordination_score"] * 5) + 1))

            alert = {
                "alert_id": f"alert-net-{uuid.uuid4().hex[:12]}",
                "post_id": representative_post_id or f"cluster-{comm_id}",
                "threat_category": "Inflammatory",  # Default for coordination alerts
                "severity": severity,
                "triggering_reason": (
                    f"Coordinated campaign detected: cluster of {data['size']} accounts "
                    f"with coordination score {data['coordination_score']:.2f}. "
                    f"Average bot likelihood: {data['avg_bot_likelihood']:.2f}. "
                    f"Shared duplicate posts: {data['duplicate_edges']}."
                ),
                "bot_cluster_id": cluster_id,
                "created_at": now,
            }
            alerts.append(alert)

            # Write cluster to Neo4j
            with self._driver.session() as session:
                session.run(
                    """
                    MERGE (c:Cluster {cluster_id: $cid})
                    SET c.coordination_score = $score,
                        c.size = $size,
                        c.avg_bot_likelihood = $avg_bot
                    """,
                    cid=cluster_id,
                    score=data["coordination_score"],
                    size=data["size"],
                    avg_bot=data["avg_bot_likelihood"],
                )
                for aid in data["accounts"]:
                    session.run(
                        """
                        MATCH (a:Account {account_id: $aid})
                        MATCH (c:Cluster {cluster_id: $cid})
                        MERGE (a)-[:MEMBER_OF]->(c)
                        """,
                        aid=aid,
                        cid=cluster_id,
                    )

        logger.info(f"Generated {len(alerts)} coordination alerts")
        return alerts

    def run_full_analysis(
        self,
        alert_threshold: float = 0.6,
        output_path: Optional[str | Path] = None,
    ) -> dict[str, Any]:
        """
        Run the full community detection and coordination analysis pipeline.

        Args:
            alert_threshold: Min coordination score to trigger alerts.
            output_path: Path to write alerts JSON (fixture mode).

        Returns:
            Summary of analysis results.
        """
        # Project graph
        G = self._project_graph()

        # Run algorithms
        communities = self.run_louvain(G)
        pageranks = self.run_pagerank(G)
        centrality = self.run_betweenness(G)

        # Write PageRank and centrality back to Neo4j
        with self._driver.session() as session:
            for aid, pr in pageranks.items():
                session.run(
                    "MATCH (a:Account {account_id: $aid}) SET a.pagerank = $pr",
                    aid=aid, pr=pr,
                )
            for aid, bc in centrality.items():
                session.run(
                    "MATCH (a:Account {account_id: $aid}) SET a.betweenness = $bc",
                    aid=aid, bc=bc,
                )

        # Compute coordination scores
        coord_scores = self.compute_coordination_scores(communities)

        # Generate alerts
        alerts = self.generate_alerts(coord_scores, threshold=alert_threshold)

        # Write alerts
        if output_path:
            output_path = Path(output_path)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            with open(output_path, "w") as f:
                json.dump(alerts, f, indent=2)
            logger.info(f"Wrote {len(alerts)} alerts to {output_path}")

        # Clean up projection
        try:
            self._gds.graph.drop(G)
        except Exception:
            pass

        return {
            "communities_detected": len(set(communities.values())) if communities else 0,
            "accounts_analyzed": len(communities),
            "suspicious_clusters": len(coord_scores),
            "alerts_generated": len(alerts),
        }


# ── CLI Entry Point ─────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys

    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
    from network_analysis.config import get_config

    config = get_config()

    detector = CommunityDetector(
        neo4j_uri=config.neo4j_uri,
        neo4j_user=config.neo4j_user,
        neo4j_password=config.neo4j_password,
    )

    detector.connect()
    try:
        result = detector.run_full_analysis(
            alert_threshold=config.coordination_alert_threshold,
            output_path=config.alerts_output_path,
        )
        print(f"\n✅ Analysis complete: {result}")
    finally:
        detector.close()

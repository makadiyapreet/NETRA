"""
FastAPI Network Analysis service.

Implements the exact API contract for the Dashboard team:
  GET /bot-score/{account_id}   → { account_id, bot_likelihood, signals }
  GET /cluster/{cluster_id}     → { cluster_id, accounts, coordination_score, graph_edges }

Queries Neo4j for stored results, falls back to heuristic scoring if
the account hasn't been loaded into the graph yet.
"""

from __future__ import annotations

import json
import logging
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# ── Pydantic Response Models ────────────────────────────────────────────────


class BotScoreResponse(BaseModel):
    """Response for GET /bot-score/{account_id}."""

    account_id: str
    bot_likelihood: float = Field(ge=0, le=1)
    signals: dict[str, float]


class GraphEdge(BaseModel):
    """A single edge in the coordination graph."""

    from_: str = Field(alias="from")
    to: str
    relation: str

    model_config = {"populate_by_name": True}


class ClusterResponse(BaseModel):
    """Response for GET /cluster/{cluster_id}."""

    cluster_id: str
    accounts: list[str]
    coordination_score: float = Field(ge=0, le=1)
    graph_edges: list[GraphEdge]


class HealthResponse(BaseModel):
    status: str
    neo4j_connected: bool
    accounts_in_graph: int


# ── Neo4j Connection ────────────────────────────────────────────────────────

_driver = None
_config = None


def _get_config():
    global _config
    if _config is None:
        sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
        from network_analysis.config import get_config
        _config = get_config()
    return _config


def _get_driver():
    global _driver
    if _driver is None:
        from neo4j import GraphDatabase
        config = _get_config()
        _driver = GraphDatabase.driver(
            config.neo4j_uri, auth=(config.neo4j_user, config.neo4j_password)
        )
    return _driver


def _query_bot_score_from_neo4j(account_id: str) -> Optional[BotScoreResponse]:
    """Query Neo4j for a pre-computed bot score."""
    try:
        driver = _get_driver()
        with driver.session() as session:
            result = session.run(
                """
                MATCH (a:Account {account_id: $aid})
                RETURN a.account_id AS account_id,
                       a.bot_likelihood AS bot_likelihood,
                       a.follower_count AS follower_count,
                       a.following_count AS following_count,
                       a.account_created_at AS account_created_at
                """,
                aid=account_id,
            ).single()

            if result and result["bot_likelihood"] is not None:
                return BotScoreResponse(
                    account_id=result["account_id"],
                    bot_likelihood=result["bot_likelihood"],
                    signals={
                        "source": "neo4j",
                        "follower_count": float(result.get("follower_count") or 0),
                        "following_count": float(result.get("following_count") or 0),
                    },
                )
    except Exception as e:
        logger.warning(f"Neo4j query failed for bot-score: {e}")

    return None


def _query_cluster_from_neo4j(cluster_id: str) -> Optional[ClusterResponse]:
    """Query Neo4j for cluster details."""
    try:
        driver = _get_driver()
        with driver.session() as session:
            # Get cluster info
            cluster_rec = session.run(
                """
                MATCH (c:Cluster {cluster_id: $cid})
                RETURN c.cluster_id AS cluster_id,
                       c.coordination_score AS coordination_score,
                       c.size AS size
                """,
                cid=cluster_id,
            ).single()

            if not cluster_rec:
                return None

            # Get member accounts
            members = session.run(
                """
                MATCH (a:Account)-[:MEMBER_OF]->(c:Cluster {cluster_id: $cid})
                RETURN a.account_id AS account_id
                """,
                cid=cluster_id,
            )
            accounts = [r["account_id"] for r in members]

            # Get graph edges between members
            edges_result = session.run(
                """
                MATCH (a1:Account)-[r]->(a2:Account)
                WHERE a1.account_id IN $aids AND a2.account_id IN $aids
                AND type(r) IN ['MENTIONED', 'SHARED_DUPLICATE']
                RETURN a1.account_id AS from_id,
                       a2.account_id AS to_id,
                       type(r) AS relation
                """,
                aids=accounts,
            )
            graph_edges = [
                GraphEdge(**{
                    "from": r["from_id"],
                    "to": r["to_id"],
                    "relation": r["relation"],
                })
                for r in edges_result
            ]

            return ClusterResponse(
                cluster_id=cluster_rec["cluster_id"],
                accounts=accounts,
                coordination_score=float(cluster_rec["coordination_score"] or 0),
                graph_edges=graph_edges,
            )

    except Exception as e:
        logger.warning(f"Neo4j query failed for cluster: {e}")

    return None


def _fallback_bot_score(account_id: str) -> Optional[BotScoreResponse]:
    """
    Fallback: compute bot score from fixture data if not in Neo4j.

    Searches fixtures/sample_posts.json for the account.
    """
    config = _get_config()
    posts_path = config.sample_posts_path

    if not posts_path.exists():
        return None

    try:
        with open(posts_path) as f:
            posts = json.load(f)

        for post in posts:
            if post.get("author_id") == account_id:
                from network_analysis.bot_detection.heuristic_scorer import compute_bot_score

                result = compute_bot_score(
                    account_id=account_id,
                    raw_payload=post.get("raw_payload", {}),
                    engagement_counts=post.get("engagement_counts"),
                )
                return BotScoreResponse(
                    account_id=result.account_id,
                    bot_likelihood=result.bot_likelihood,
                    signals=result.signals,
                )

    except Exception as e:
        logger.warning(f"Fallback bot score failed: {e}")

    return None


# ── FastAPI App ─────────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize Neo4j connection on startup."""
    logger.info("Starting Network Analysis service...")
    try:
        _get_driver()
        logger.info("Neo4j connection established")
    except Exception as e:
        logger.warning(f"Neo4j not available (running without graph): {e}")
    yield
    if _driver:
        _driver.close()
    logger.info("Network Analysis service shut down")


app = FastAPI(
    title="NETRA Network Analysis Service",
    description="Bot scoring and coordination cluster analysis API for the Dashboard team",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/health", response_model=HealthResponse)
async def health():
    """Health check endpoint."""
    neo4j_ok = False
    account_count = 0

    try:
        driver = _get_driver()
        with driver.session() as session:
            rec = session.run("MATCH (a:Account) RETURN count(a) AS cnt").single()
            account_count = rec["cnt"] if rec else 0
            neo4j_ok = True
    except Exception:
        pass

    return HealthResponse(
        status="ok",
        neo4j_connected=neo4j_ok,
        accounts_in_graph=account_count,
    )


@app.get("/bot-score/{account_id}", response_model=BotScoreResponse)
async def get_bot_score(account_id: str):
    """
    Get bot-likelihood score for an account.

    Queries Neo4j first, falls back to heuristic scoring from fixture data.
    """
    # Try Neo4j first
    result = _query_bot_score_from_neo4j(account_id)
    if result:
        return result

    # Fallback to heuristic scoring
    result = _fallback_bot_score(account_id)
    if result:
        return result

    raise HTTPException(
        status_code=404,
        detail=f"Account '{account_id}' not found in graph or fixture data",
    )


@app.get("/cluster/{cluster_id}", response_model=ClusterResponse)
async def get_cluster(cluster_id: str):
    """
    Get coordination cluster details.

    Returns member accounts, coordination score, and graph edges.
    """
    result = _query_cluster_from_neo4j(cluster_id)
    if result:
        return result

    raise HTTPException(
        status_code=404,
        detail=f"Cluster '{cluster_id}' not found. Run community detection first.",
    )


@app.get("/clusters")
async def list_clusters():
    """
    List all coordination clusters.

    Queries Neo4j for clusters identified by Louvain community detection.
    Returns empty list if Neo4j is unavailable (graceful degradation).
    """
    try:
        driver = _get_driver()
        with driver.session() as session:
            records = session.run(
                """
                MATCH (c:Cluster)
                OPTIONAL MATCH (a:Account)-[:MEMBER_OF]->(c)
                WITH c, collect(a.account_id) AS accounts
                RETURN c.cluster_id AS cluster_id,
                       c.coordination_score AS coordination_score,
                       c.size AS size,
                       accounts
                ORDER BY c.coordination_score DESC
                LIMIT 50
                """
            )
            clusters = []
            for rec in records:
                clusters.append({
                    "cluster_id": rec["cluster_id"],
                    "coordination_score": rec["coordination_score"] or 0.0,
                    "accounts": rec["accounts"] or [],
                    "graph_edges": [],
                })
            return clusters
    except Exception as e:
        logger.warning(f"Neo4j unavailable for /clusters: {e}")
        # Return empty list — the API Gateway will fall back to DataStore heuristics
        return []


# ── Entry Point ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    logging.basicConfig(level=logging.INFO)
    config = _get_config()
    uvicorn.run(app, host=config.host, port=config.port)


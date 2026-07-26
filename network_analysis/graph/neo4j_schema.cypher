// ============================================================
// NETRA — Neo4j Schema Setup
// Run once to initialize constraints, indexes, and schema.
// ============================================================

// ── Node Uniqueness Constraints ────────────────────────────

CREATE CONSTRAINT account_id_unique IF NOT EXISTS
FOR (a:Account) REQUIRE a.account_id IS UNIQUE;

CREATE CONSTRAINT post_id_unique IF NOT EXISTS
FOR (p:Post) REQUIRE p.post_id IS UNIQUE;

CREATE CONSTRAINT cluster_id_unique IF NOT EXISTS
FOR (c:Cluster) REQUIRE c.cluster_id IS UNIQUE;

// ── Performance Indexes ────────────────────────────────────

CREATE INDEX post_threat_category IF NOT EXISTS
FOR (p:Post) ON (p.threat_category);

CREATE INDEX post_platform IF NOT EXISTS
FOR (p:Post) ON (p.platform);

CREATE INDEX account_bot_likelihood IF NOT EXISTS
FOR (a:Account) ON (a.bot_likelihood);

CREATE INDEX account_handle IF NOT EXISTS
FOR (a:Account) ON (a.handle);

CREATE INDEX cluster_coordination_score IF NOT EXISTS
FOR (c:Cluster) ON (c.coordination_score);

// ── Relationship Types (documentation) ─────────────────────
//
// (:Account)-[:POSTED]->(:Post)
//   Account authored a post.
//
// (:Account)-[:MENTIONED {in_post: post_id}]->(:Account)
//   Account A mentioned Account B in a post.
//
// (:Post)-[:DUPLICATE_OF {similarity: float}]->(:Post)
//   Near-duplicate relationship between posts.
//
// (:Account)-[:SHARED_DUPLICATE {via_posts: [post_ids]}]->(:Account)
//   Two accounts posted near-duplicate content (coordination signal).
//
// (:Account)-[:MEMBER_OF]->(:Cluster)
//   Account belongs to a detected coordination cluster.
//
// ============================================================

"""
Near-duplicate detection using MinHash LSH from the datasketch library.

Identifies coordinated amplification by finding clusters of posts with
near-identical text content (e.g., copy-paste campaigns).
Uses character n-gram shingling for language-agnostic operation.
"""

from __future__ import annotations

import logging
import re
from collections import defaultdict
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class DuplicateCluster:
    """A cluster of near-duplicate posts."""

    cluster_id: str
    post_ids: tuple[str, ...]
    author_ids: tuple[str, ...]
    similarity: float  # Average pairwise similarity
    representative_text: str  # Text from the first post in the cluster


@dataclass
class DuplicateDetectionResult:
    """Result of near-duplicate detection."""

    clusters: list[DuplicateCluster] = field(default_factory=list)
    total_posts: int = 0
    duplicate_posts: int = 0
    unique_posts: int = 0


def _normalize_text(text: str) -> str:
    """
    Normalize text for shingling.

    Lowercases, strips extra whitespace, removes URLs and mentions.
    Preserves Indic script characters.
    """
    # Remove URLs
    text = re.sub(r"https?://\S+", "", text)
    # Remove @mentions
    text = re.sub(r"@\w+", "", text)
    # Remove hashtag symbols (keep the word)
    text = re.sub(r"#(\w+)", r"\1", text)
    # Normalize whitespace
    text = re.sub(r"\s+", " ", text).strip()
    # Lowercase (works for Latin; Indic scripts don't have case)
    text = text.lower()
    return text


def _shingle(text: str, n: int = 5) -> set[str]:
    """
    Create character n-gram shingles from text.

    Character-level shingling is language-agnostic and works well for
    detecting near-duplicates across Gujarati, Hindi, Hinglish, and English.

    Args:
        text: Normalized text.
        n: Shingle size (number of characters).

    Returns:
        Set of character n-gram shingles.
    """
    if len(text) < n:
        return {text} if text else set()

    return {text[i : i + n] for i in range(len(text) - n + 1)}


def find_duplicates(
    posts: list[dict],
    threshold: float = 0.8,
    num_perm: int = 128,
    shingle_size: int = 5,
    text_key: str = "text",
    id_key: str = "post_id",
    author_key: str = "author_id",
) -> DuplicateDetectionResult:
    """
    Find clusters of near-duplicate posts using MinHash LSH.

    Args:
        posts: List of post dicts (must have text_key and id_key fields).
        threshold: Jaccard similarity threshold (0-1). Higher = stricter.
        num_perm: Number of permutations for MinHash (higher = more accurate, slower).
        shingle_size: Character n-gram size.
        text_key: Key for text field in post dicts.
        id_key: Key for post ID field.
        author_key: Key for author ID field.

    Returns:
        DuplicateDetectionResult with clusters of near-duplicate posts.
    """
    try:
        from datasketch import MinHash, MinHashLSH
    except ImportError:
        logger.error("datasketch not installed. Install with: pip install datasketch")
        return DuplicateDetectionResult(total_posts=len(posts))

    if not posts:
        return DuplicateDetectionResult()

    # Build MinHash signatures
    lsh = MinHashLSH(threshold=threshold, num_perm=num_perm)
    minhashes: dict[str, MinHash] = {}
    post_lookup: dict[str, dict] = {}

    for post in posts:
        post_id = post.get(id_key, "")
        text = post.get(text_key, "")
        if not post_id or not text:
            continue

        post_lookup[post_id] = post
        normalized = _normalize_text(text)
        shingles = _shingle(normalized, shingle_size)

        if not shingles:
            continue

        m = MinHash(num_perm=num_perm)
        for shingle in shingles:
            m.update(shingle.encode("utf-8"))

        minhashes[post_id] = m

        try:
            lsh.insert(post_id, m)
        except ValueError:
            # Duplicate key — already inserted
            pass

    # Find clusters via LSH queries
    visited: set[str] = set()
    raw_clusters: list[set[str]] = []

    for post_id, mh in minhashes.items():
        if post_id in visited:
            continue

        # Query for similar posts
        candidates = lsh.query(mh)
        if len(candidates) > 1:
            cluster = set(candidates)
            # Merge with any overlapping existing clusters
            merged = False
            for existing in raw_clusters:
                if existing & cluster:
                    existing |= cluster
                    merged = True
                    break
            if not merged:
                raw_clusters.append(cluster)
            visited.update(cluster)
        else:
            visited.add(post_id)

    # Build DuplicateCluster objects
    clusters: list[DuplicateCluster] = []
    all_duplicate_ids: set[str] = set()

    for i, cluster_ids in enumerate(raw_clusters):
        sorted_ids = sorted(cluster_ids)
        all_duplicate_ids.update(sorted_ids)

        author_ids = tuple(
            post_lookup[pid].get(author_key, "unknown")
            for pid in sorted_ids
            if pid in post_lookup
        )

        # Compute average pairwise similarity
        similarities = []
        sorted_list = list(sorted_ids)
        for a_idx in range(len(sorted_list)):
            for b_idx in range(a_idx + 1, len(sorted_list)):
                a_id, b_id = sorted_list[a_idx], sorted_list[b_idx]
                if a_id in minhashes and b_id in minhashes:
                    sim = minhashes[a_id].jaccard(minhashes[b_id])
                    similarities.append(sim)

        avg_similarity = sum(similarities) / len(similarities) if similarities else threshold

        rep_text = post_lookup.get(sorted_ids[0], {}).get(text_key, "")

        clusters.append(
            DuplicateCluster(
                cluster_id=f"dup-cluster-{i:03d}",
                post_ids=tuple(sorted_ids),
                author_ids=author_ids,
                similarity=round(avg_similarity, 4),
                representative_text=rep_text[:200],
            )
        )

    return DuplicateDetectionResult(
        clusters=clusters,
        total_posts=len(posts),
        duplicate_posts=len(all_duplicate_ids),
        unique_posts=len(posts) - len(all_duplicate_ids),
    )

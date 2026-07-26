"""
FAISS-based vector store for historical case linking.

Stores sentence embeddings of classified posts and enables
similarity search to find related past incidents.

Usage:
    from nlp_engine.inference.vector_store import VectorStore
    store = VectorStore()
    store.add_embedding("post_123", "threatening message in Gujarati")
    results = store.search_similar("violent threat in Ahmedabad", top_k=5)
"""

from __future__ import annotations

import logging
import pickle
from pathlib import Path
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

_DEFAULT_INDEX_PATH = "checkpoints/vector_index.pkl"
_EMBEDDING_DIM = 384  # sentence-transformers default


class VectorStore:
    """
    Lightweight FAISS vector index for hackathon-scale similarity search.

    Uses sentence-transformers for embedding generation and FAISS for
    approximate nearest-neighbor search.
    """

    def __init__(self, index_path: str = _DEFAULT_INDEX_PATH):
        self.index_path = Path(index_path)
        self._index = None
        self._post_ids: list[str] = []
        self._texts: list[str] = []
        self._encoder = None
        self._faiss = None

    def _ensure_faiss(self) -> bool:
        """Lazy-load FAISS."""
        if self._faiss is not None:
            return True
        try:
            import faiss
            self._faiss = faiss
            return True
        except ImportError:
            logger.warning("FAISS not installed. Install with: pip install faiss-cpu")
            return False

    def _ensure_encoder(self) -> bool:
        """Lazy-load sentence-transformer encoder."""
        if self._encoder is not None:
            return True
        try:
            from sentence_transformers import SentenceTransformer
            self._encoder = SentenceTransformer("all-MiniLM-L6-v2")
            return True
        except ImportError:
            logger.warning(
                "sentence-transformers not installed. "
                "Install with: pip install sentence-transformers"
            )
            return False

    def _init_index(self) -> None:
        """Initialize or load FAISS index."""
        if not self._ensure_faiss():
            return

        if self.index_path.exists():
            try:
                with open(self.index_path, "rb") as f:
                    data = pickle.load(f)
                    self._index = data["index"]
                    self._post_ids = data["post_ids"]
                    self._texts = data["texts"]
                logger.info(f"Loaded vector index with {len(self._post_ids)} entries")
                return
            except Exception as e:
                logger.warning(f"Failed to load index: {e}")

        self._index = self._faiss.IndexFlatIP(_EMBEDDING_DIM)  # Inner product (cosine after normalization)
        self._post_ids = []
        self._texts = []

    def add_embedding(self, post_id: str, text: str) -> bool:
        """
        Add a post's embedding to the index.

        Args:
            post_id: Unique post identifier.
            text: Post text to embed.

        Returns:
            True if successfully added.
        """
        if not self._ensure_faiss() or not self._ensure_encoder():
            return False

        if self._index is None:
            self._init_index()

        if post_id in self._post_ids:
            return True  # Already indexed

        try:
            embedding = self._encoder.encode([text], normalize_embeddings=True)
            self._index.add(embedding.astype(np.float32))
            self._post_ids.append(post_id)
            self._texts.append(text[:500])
            return True
        except Exception as e:
            logger.error(f"Failed to add embedding: {e}")
            return False

    def search_similar(
        self, text: str, top_k: int = 5
    ) -> list[dict[str, any]]:
        """
        Find the most similar historical posts.

        Args:
            text: Query text.
            top_k: Number of results to return.

        Returns:
            List of { post_id, text, similarity_score }.
        """
        if not self._ensure_faiss() or not self._ensure_encoder():
            return []

        if self._index is None:
            self._init_index()

        if self._index.ntotal == 0:
            return []

        try:
            query = self._encoder.encode([text], normalize_embeddings=True)
            scores, indices = self._index.search(
                query.astype(np.float32), min(top_k, self._index.ntotal)
            )

            results = []
            for score, idx in zip(scores[0], indices[0]):
                if idx < 0 or idx >= len(self._post_ids):
                    continue
                results.append({
                    "post_id": self._post_ids[idx],
                    "text": self._texts[idx],
                    "similarity_score": float(score),
                })

            return results
        except Exception as e:
            logger.error(f"Similarity search failed: {e}")
            return []

    def save(self) -> None:
        """Persist index to disk."""
        if self._index is None:
            return

        self.index_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.index_path, "wb") as f:
            pickle.dump({
                "index": self._index,
                "post_ids": self._post_ids,
                "texts": self._texts,
            }, f)
        logger.info(f"Saved vector index ({len(self._post_ids)} entries)")

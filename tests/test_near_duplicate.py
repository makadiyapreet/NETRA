"""
Tests for near-duplicate detection using MinHash LSH.

Requires: pip install datasketch
"""

import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

datasketch = pytest.importorskip("datasketch", reason="datasketch required for duplicate tests")

from network_analysis.bot_detection.near_duplicate import (
    DuplicateCluster,
    DuplicateDetectionResult,
    find_duplicates,
    _normalize_text,
    _shingle,
)


class TestTextNormalization:
    """Test text preprocessing for shingling."""

    def test_url_removal(self):
        """URLs should be removed."""
        text = "Check this out https://example.com/fake-news some text"
        result = _normalize_text(text)
        assert "https" not in result
        assert "example.com" not in result
        assert "some text" in result

    def test_mention_removal(self):
        """@mentions should be removed."""
        text = "@user_123 said something @another_user"
        result = _normalize_text(text)
        assert "@user_123" not in result
        assert "@another_user" not in result

    def test_hashtag_symbol_removal(self):
        """# symbol should be removed but hashtag word kept."""
        text = "This is #breaking news #urgent"
        result = _normalize_text(text)
        assert "#" not in result
        assert "breaking" in result
        assert "urgent" in result

    def test_lowercase(self):
        """Text should be lowercased."""
        text = "BREAKING NEWS Alert"
        result = _normalize_text(text)
        assert result == "breaking news alert"

    def test_whitespace_normalization(self):
        """Multiple whitespace should be collapsed."""
        text = "too   much     space"
        result = _normalize_text(text)
        assert result == "too much space"


class TestShingling:
    """Test character n-gram shingling."""

    def test_basic_shingling(self):
        """Should produce correct number of shingles."""
        text = "hello"
        shingles = _shingle(text, n=3)
        assert len(shingles) == 3  # "hel", "ell", "llo"

    def test_short_text(self):
        """Text shorter than n should return the text itself."""
        shingles = _shingle("ab", n=5)
        assert shingles == {"ab"}

    def test_empty_text(self):
        """Empty text should return empty set."""
        shingles = _shingle("", n=5)
        assert shingles == set()

    def test_unicode_shingling(self):
        """Shingling should work with Unicode (Indic scripts)."""
        text = "नमस्ते"
        shingles = _shingle(text, n=3)
        assert len(shingles) > 0


class TestDuplicateDetection:
    """Test the full duplicate detection pipeline."""

    def test_identical_texts_detected(self):
        """Identical texts should be in the same cluster."""
        posts = [
            {"post_id": "p1", "text": "This is a test post about fake news spreading", "author_id": "a1"},
            {"post_id": "p2", "text": "This is a test post about fake news spreading", "author_id": "a2"},
        ]
        result = find_duplicates(posts, threshold=0.8)
        assert isinstance(result, DuplicateDetectionResult)
        assert len(result.clusters) == 1
        assert set(result.clusters[0].post_ids) == {"p1", "p2"}

    def test_near_duplicates_detected(self):
        """Slightly modified texts should still be detected."""
        posts = [
            {"post_id": "p1", "text": "BREAKING vaccine mein chip daal ke sab ko track kar rahe hain share karo", "author_id": "a1"},
            {"post_id": "p2", "text": "BREAKING vaccine mein chip daal ke sab ko track kar rahe hain SHARE karo!", "author_id": "a2"},
            {"post_id": "p3", "text": "BREAKING vaccine mein chip daal ke sab ko track kar rahe hain share KARO JALDI", "author_id": "a3"},
        ]
        result = find_duplicates(posts, threshold=0.7)
        assert len(result.clusters) >= 1
        # All three should be in same cluster
        all_ids = set()
        for cluster in result.clusters:
            all_ids.update(cluster.post_ids)
        assert all_ids == {"p1", "p2", "p3"}

    def test_different_texts_not_clustered(self):
        """Completely different texts should not be clustered."""
        posts = [
            {"post_id": "p1", "text": "The weather is beautiful today in Ahmedabad Gujarat", "author_id": "a1"},
            {"post_id": "p2", "text": "Election results show surprising changes in several constituencies", "author_id": "a2"},
        ]
        result = find_duplicates(posts, threshold=0.8)
        assert len(result.clusters) == 0

    def test_empty_input(self):
        """Empty post list should return empty result."""
        result = find_duplicates([])
        assert result.total_posts == 0
        assert len(result.clusters) == 0

    def test_single_post(self):
        """Single post should not create any cluster."""
        posts = [{"post_id": "p1", "text": "Just a single post", "author_id": "a1"}]
        result = find_duplicates(posts, threshold=0.8)
        assert len(result.clusters) == 0

    def test_cluster_has_author_ids(self):
        """Clusters should contain author IDs."""
        posts = [
            {"post_id": "p1", "text": "Duplicate content for testing purposes here", "author_id": "author_1"},
            {"post_id": "p2", "text": "Duplicate content for testing purposes here", "author_id": "author_2"},
        ]
        result = find_duplicates(posts, threshold=0.8)
        assert len(result.clusters) == 1
        assert "author_1" in result.clusters[0].author_ids
        assert "author_2" in result.clusters[0].author_ids

    def test_result_stats(self):
        """Result should have correct statistics."""
        posts = [
            {"post_id": "p1", "text": "Same exact content shared by bot network accounts", "author_id": "a1"},
            {"post_id": "p2", "text": "Same exact content shared by bot network accounts", "author_id": "a2"},
            {"post_id": "p3", "text": "Completely unique and different text about something else entirely", "author_id": "a3"},
        ]
        result = find_duplicates(posts, threshold=0.8)
        assert result.total_posts == 3
        assert result.duplicate_posts == 2
        assert result.unique_posts == 1

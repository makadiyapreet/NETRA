"""
Tests for JSON schema validation.

Validates that fixture data conforms to the shared schemas.
"""

import json
import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

jsonschema = pytest.importorskip("jsonschema", reason="jsonschema required for schema tests")
from jsonschema import validate, ValidationError

PROJECT_ROOT = Path(__file__).resolve().parent.parent


@pytest.fixture
def post_schema():
    """Load post_schema.json."""
    with open(PROJECT_ROOT / "shared" / "schemas" / "post_schema.json") as f:
        return json.load(f)


@pytest.fixture
def classification_schema():
    """Load threat_classification_schema.json."""
    with open(PROJECT_ROOT / "shared" / "schemas" / "threat_classification_schema.json") as f:
        return json.load(f)


@pytest.fixture
def alert_schema():
    """Load alert_schema.json."""
    with open(PROJECT_ROOT / "shared" / "schemas" / "alert_schema.json") as f:
        return json.load(f)


@pytest.fixture
def sample_posts():
    """Load sample_posts.json."""
    with open(PROJECT_ROOT / "fixtures" / "sample_posts.json") as f:
        return json.load(f)


class TestPostSchema:
    """Validate sample posts against post_schema.json."""

    def test_all_posts_valid(self, sample_posts, post_schema):
        """Every post in sample_posts.json should validate against the schema."""
        for i, post in enumerate(sample_posts):
            try:
                validate(instance=post, schema=post_schema)
            except ValidationError as e:
                pytest.fail(
                    f"Post #{i} (id={post.get('post_id', '?')}) failed validation: "
                    f"{e.message}"
                )

    def test_post_count(self, sample_posts):
        """Should have ~30 sample posts."""
        assert len(sample_posts) >= 28, f"Expected ~30 posts, got {len(sample_posts)}"

    def test_all_platforms_represented(self, sample_posts):
        """All 4 platforms should be represented."""
        platforms = {p["platform"] for p in sample_posts}
        assert "twitter" in platforms
        assert "instagram" in platforms
        assert "facebook" in platforms
        assert "youtube" in platforms

    def test_required_raw_payload_fields(self, sample_posts):
        """Every post must have bot-scoring fields in raw_payload."""
        required_fields = ["account_created_at", "follower_count", "following_count", "post_count"]
        for post in sample_posts:
            for field in required_fields:
                assert field in post["raw_payload"], (
                    f"Post {post['post_id']} missing raw_payload.{field}"
                )

    def test_post_ids_unique(self, sample_posts):
        """All post_ids should be unique."""
        ids = [p["post_id"] for p in sample_posts]
        assert len(ids) == len(set(ids)), "Duplicate post_ids found"


class TestClassificationSchema:
    """Validate classification output format."""

    def test_valid_classification(self, classification_schema):
        """A properly formatted classification should validate."""
        valid = {
            "post_id": "tw-20260720-001",
            "threat_category": "Inflammatory",
            "threat_confidence": 0.85,
            "sentiment": "negative",
            "sentiment_intensity": 0.72,
            "detected_language": "gu",
            "model_version": "indicbert-v0.1.0-dev",
            "classified_at": "2026-07-20T12:00:00Z",
        }
        validate(instance=valid, schema=classification_schema)

    def test_invalid_threat_category(self, classification_schema):
        """Invalid threat_category should fail validation."""
        invalid = {
            "post_id": "test",
            "threat_category": "InvalidCategory",
            "threat_confidence": 0.5,
            "sentiment": "neutral",
            "sentiment_intensity": 0.5,
            "detected_language": "en",
            "model_version": "test",
            "classified_at": "2026-07-20T12:00:00Z",
        }
        with pytest.raises(ValidationError):
            validate(instance=invalid, schema=classification_schema)

    def test_missing_required_field(self, classification_schema):
        """Missing required field should fail."""
        invalid = {
            "post_id": "test",
            "threat_category": "Neutral",
            # missing threat_confidence and other required fields
        }
        with pytest.raises(ValidationError):
            validate(instance=invalid, schema=classification_schema)


class TestAlertSchema:
    """Validate alert output format."""

    def test_valid_alert(self, alert_schema):
        """A properly formatted alert should validate."""
        valid = {
            "alert_id": "alert-abc123",
            "post_id": "tw-20260720-001",
            "threat_category": "IncitementToViolence",
            "severity": 5,
            "triggering_reason": "High-confidence incitement to violence detected.",
            "bot_cluster_id": None,
            "created_at": "2026-07-20T12:00:00Z",
        }
        validate(instance=valid, schema=alert_schema)

    def test_severity_range(self, alert_schema):
        """Severity must be 1-5."""
        invalid = {
            "alert_id": "alert-test",
            "post_id": "test",
            "threat_category": "Neutral",
            "severity": 10,  # Invalid: > 5
            "triggering_reason": "Test",
            "bot_cluster_id": None,
            "created_at": "2026-07-20T12:00:00Z",
        }
        with pytest.raises(ValidationError):
            validate(instance=invalid, schema=alert_schema)

    def test_bot_cluster_id_nullable(self, alert_schema):
        """bot_cluster_id should accept both string and null."""
        with_cluster = {
            "alert_id": "alert-1",
            "post_id": "test",
            "threat_category": "Inflammatory",
            "severity": 3,
            "triggering_reason": "Test",
            "bot_cluster_id": "cluster-0001",
            "created_at": "2026-07-20T12:00:00Z",
        }
        validate(instance=with_cluster, schema=alert_schema)

        without_cluster = {**with_cluster, "bot_cluster_id": None}
        validate(instance=without_cluster, schema=alert_schema)

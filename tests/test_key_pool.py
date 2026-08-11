"""
Comprehensive tests for the KeyPool system.

Tests cover:
- Pool construction from numbered env vars + backward compat
- Active key retrieval
- Exhaustion + rotation
- Cooldown recovery
- All keys exhausted
- Invalid key handling
- call_with_key_rotation wrapper
- Unrelated errors pass-through
- Status report shape
"""

from __future__ import annotations

import os
import time
import unittest
from unittest.mock import patch

from ingestion.key_pool import (
    KeyPool,
    KeyStatus,
    call_with_key_rotation,
    load_keys_from_env,
    load_key_pairs_from_env,
)


class TestKeyPool(unittest.TestCase):
    """Unit tests for the KeyPool class."""

    def test_pool_construction_basic(self):
        """Pool initializes with provided keys, all ACTIVE."""
        pool = KeyPool(["key1", "key2", "key3"], cooldown_seconds=60)
        self.assertEqual(pool.size, 3)
        self.assertEqual(pool.active_count, 3)

    def test_pool_construction_filters_empty(self):
        """Pool skips empty strings."""
        pool = KeyPool(["key1", "", "   ", "key2"], cooldown_seconds=60)
        self.assertEqual(pool.size, 2)

    def test_pool_construction_empty(self):
        """Pool with no valid keys has size 0."""
        pool = KeyPool([], cooldown_seconds=60)
        self.assertEqual(pool.size, 0)
        self.assertIsNone(pool.get_active_key())

    def test_get_active_key_returns_first(self):
        """get_active_key returns the first active key."""
        pool = KeyPool(["alpha", "beta", "gamma"])
        self.assertEqual(pool.get_active_key(), "alpha")

    def test_get_active_key_after_exhaustion(self):
        """After marking key1 exhausted, get_active_key returns key2."""
        pool = KeyPool(["key1", "key2", "key3"], cooldown_seconds=3600)
        pool.mark_exhausted("key1")
        self.assertEqual(pool.get_active_key(), "key2")
        self.assertEqual(pool.active_count, 2)

    def test_all_keys_exhausted_returns_none(self):
        """When all keys are exhausted, get_active_key returns None."""
        pool = KeyPool(["key1", "key2"], cooldown_seconds=3600)
        pool.mark_exhausted("key1")
        pool.mark_exhausted("key2")
        self.assertIsNone(pool.get_active_key())
        self.assertEqual(pool.active_count, 0)

    def test_cooldown_recovery(self):
        """Exhausted key returns to ACTIVE after cooldown expires."""
        pool = KeyPool(["key1", "key2"], cooldown_seconds=1)  # 1-second cooldown
        pool.mark_exhausted("key1")

        # Immediately after exhaustion, key1 not active
        self.assertEqual(pool.get_active_key(), "key2")

        # Wait for cooldown to expire
        time.sleep(1.1)

        # Now key1 should be recovered
        self.assertEqual(pool.get_active_key(), "key1")
        self.assertEqual(pool.active_count, 2)

    def test_invalid_key_not_auto_recovered(self):
        """Invalid keys do NOT auto-recover, even after cooldown."""
        pool = KeyPool(["key1", "key2"], cooldown_seconds=1)
        pool.mark_invalid("key1")

        time.sleep(1.1)

        # key1 should still be invalid
        self.assertEqual(pool.get_active_key(), "key2")
        self.assertEqual(pool.active_count, 1)

    def test_mark_exhausted_idempotent(self):
        """Marking an already-exhausted key is harmless."""
        pool = KeyPool(["key1"], cooldown_seconds=3600)
        pool.mark_exhausted("key1")
        pool.mark_exhausted("key1")  # should not error
        self.assertEqual(pool.active_count, 0)

    def test_mark_nonexistent_key(self):
        """Marking a key not in the pool is a no-op (no crash)."""
        pool = KeyPool(["key1"], cooldown_seconds=3600)
        pool.mark_exhausted("key_not_in_pool")  # should not crash
        self.assertEqual(pool.active_count, 1)

    def test_status_report_shape(self):
        """Status report returns correct structure with masked suffixes."""
        pool = KeyPool(["abcdefgh", "12345678"], cooldown_seconds=3600)
        pool.mark_exhausted("abcdefgh")

        report = pool.status_report()
        self.assertEqual(len(report), 2)

        # First key: exhausted
        self.assertEqual(report[0]["key_suffix"], "efgh")
        self.assertEqual(report[0]["status"], "exhausted")
        self.assertIsNotNone(report[0]["exhausted_at"])

        # Second key: active
        self.assertEqual(report[1]["key_suffix"], "5678")
        self.assertEqual(report[1]["status"], "active")
        self.assertIsNone(report[1]["exhausted_at"])

    def test_status_report_short_key(self):
        """Short keys (<4 chars) are masked as '****'."""
        pool = KeyPool(["abc"], cooldown_seconds=60)
        report = pool.status_report()
        self.assertEqual(report[0]["key_suffix"], "****")

    def test_rotation_order(self):
        """Keys rotate in order: first exhausted → second used → etc."""
        pool = KeyPool(["k1", "k2", "k3"], cooldown_seconds=3600)

        self.assertEqual(pool.get_active_key(), "k1")
        pool.mark_exhausted("k1")
        self.assertEqual(pool.get_active_key(), "k2")
        pool.mark_exhausted("k2")
        self.assertEqual(pool.get_active_key(), "k3")
        pool.mark_exhausted("k3")
        self.assertIsNone(pool.get_active_key())

    def test_mixed_exhausted_and_invalid(self):
        """Pool with a mix of exhausted and invalid keys works correctly."""
        pool = KeyPool(["k1", "k2", "k3"], cooldown_seconds=3600)
        pool.mark_invalid("k1")
        pool.mark_exhausted("k2")
        self.assertEqual(pool.get_active_key(), "k3")
        self.assertEqual(pool.active_count, 1)


class TestCallWithKeyRotation(unittest.TestCase):
    """Tests for the call_with_key_rotation wrapper."""

    def test_success_on_first_key(self):
        """Successful request on first key returns the result."""
        pool = KeyPool(["key1", "key2"])
        result = call_with_key_rotation(
            pool=pool,
            make_request=lambda key: {"data": "success", "used_key": key},
            is_quota_exhausted=lambda exc: False,
            is_key_invalid=lambda exc: False,
        )
        self.assertEqual(result["data"], "success")
        self.assertEqual(result["used_key"], "key1")

    def test_rotation_on_quota_exhaustion(self):
        """When first key triggers quota exhaustion, second key is tried."""
        pool = KeyPool(["bad_key", "good_key"])
        call_count = {"n": 0}

        def make_request(key):
            call_count["n"] += 1
            if key == "bad_key":
                raise Exception("QuotaExceeded")
            return {"data": "success", "used_key": key}

        result = call_with_key_rotation(
            pool=pool,
            make_request=make_request,
            is_quota_exhausted=lambda exc: "QuotaExceeded" in str(exc),
            is_key_invalid=lambda exc: False,
        )
        self.assertEqual(result["data"], "success")
        self.assertEqual(result["used_key"], "good_key")
        self.assertEqual(call_count["n"], 2)

    def test_all_keys_exhausted_returns_error(self):
        """When all keys fail quota, returns error dict (no exception)."""
        pool = KeyPool(["k1", "k2"])

        result = call_with_key_rotation(
            pool=pool,
            make_request=lambda key: (_ for _ in ()).throw(Exception("QuotaExceeded")),
            is_quota_exhausted=lambda exc: True,
            is_key_invalid=lambda exc: False,
        )
        self.assertEqual(result["error"], "all_keys_exhausted")

    def test_invalid_key_triggers_rotation(self):
        """Invalid key (auth error) triggers rotation to next key."""
        pool = KeyPool(["invalid_key", "valid_key"])

        def make_request(key):
            if key == "invalid_key":
                raise Exception("Unauthorized")
            return {"data": "ok", "key": key}

        result = call_with_key_rotation(
            pool=pool,
            make_request=make_request,
            is_quota_exhausted=lambda exc: False,
            is_key_invalid=lambda exc: "Unauthorized" in str(exc),
        )
        self.assertEqual(result["data"], "ok")
        self.assertEqual(result["key"], "valid_key")

    def test_unrelated_error_re_raised(self):
        """Non-quota, non-auth errors are re-raised, not swallowed."""
        pool = KeyPool(["key1", "key2"])

        with self.assertRaises(ValueError):
            call_with_key_rotation(
                pool=pool,
                make_request=lambda key: (_ for _ in ()).throw(ValueError("Network timeout")),
                is_quota_exhausted=lambda exc: False,
                is_key_invalid=lambda exc: False,
            )

    def test_empty_pool_returns_error_immediately(self):
        """Empty pool returns error dict without calling make_request."""
        pool = KeyPool([])
        call_count = {"n": 0}

        result = call_with_key_rotation(
            pool=pool,
            make_request=lambda key: call_count.update(n=call_count["n"] + 1),
            is_quota_exhausted=lambda exc: False,
            is_key_invalid=lambda exc: False,
        )
        self.assertEqual(result["error"], "all_keys_exhausted")
        self.assertEqual(call_count["n"], 0)


class TestLoadKeysFromEnv(unittest.TestCase):
    """Tests for loading API keys from environment variables."""

    @patch.dict(os.environ, {
        "TEST_KEY_1": "first",
        "TEST_KEY_2": "second",
        "TEST_KEY_3": "third",
    }, clear=False)
    def test_numbered_keys(self):
        """Loads numbered keys PREFIX_1, PREFIX_2, etc."""
        keys = load_keys_from_env("TEST_KEY")
        self.assertEqual(keys, ["first", "second", "third"])

    @patch.dict(os.environ, {
        "LEGACY_KEY": "single_key",
    }, clear=False)
    def test_backward_compat_unsuffixed(self):
        """Falls back to un-suffixed var when no numbered keys exist."""
        # Make sure LEGACY_KEY_1 etc. don't exist
        for i in range(1, 21):
            os.environ.pop(f"LEGACY_KEY_{i}", None)
        keys = load_keys_from_env("LEGACY_KEY")
        self.assertEqual(keys, ["single_key"])

    @patch.dict(os.environ, {
        "MIXED_KEY_1": "numbered_one",
        "MIXED_KEY": "should_be_ignored",
    }, clear=False)
    def test_numbered_takes_precedence(self):
        """When numbered keys exist, un-suffixed var is NOT loaded."""
        keys = load_keys_from_env("MIXED_KEY")
        self.assertEqual(keys, ["numbered_one"])
        self.assertNotIn("should_be_ignored", keys)

    def test_no_keys_at_all(self):
        """Returns empty list when nothing is set."""
        # Use a prefix that definitely doesn't exist
        keys = load_keys_from_env("ZZZZZ_NONEXISTENT_KEY")
        self.assertEqual(keys, [])

    @patch.dict(os.environ, {
        "SPACED_KEY_1": "  has_spaces  ",
        "SPACED_KEY_2": "",
    }, clear=False)
    def test_strips_whitespace_and_skips_empty(self):
        """Strips whitespace; empty-after-strip keys are skipped."""
        keys = load_keys_from_env("SPACED_KEY")
        self.assertEqual(keys, ["has_spaces"])


class TestLoadKeyPairsFromEnv(unittest.TestCase):
    """Tests for loading paired credentials (e.g. Reddit)."""

    @patch.dict(os.environ, {
        "RD_ID_1": "client1",
        "RD_SECRET_1": "secret1",
        "RD_ID_2": "client2",
        "RD_SECRET_2": "secret2",
    }, clear=False)
    def test_numbered_pairs(self):
        """Loads numbered credential pairs."""
        pairs = load_key_pairs_from_env("RD_ID", "RD_SECRET")
        self.assertEqual(pairs, [("client1", "secret1"), ("client2", "secret2")])

    @patch.dict(os.environ, {
        "SOLO_ID": "single_id",
        "SOLO_SECRET": "single_secret",
    }, clear=False)
    def test_backward_compat_pair(self):
        """Falls back to un-suffixed vars."""
        for i in range(1, 21):
            os.environ.pop(f"SOLO_ID_{i}", None)
            os.environ.pop(f"SOLO_SECRET_{i}", None)
        pairs = load_key_pairs_from_env("SOLO_ID", "SOLO_SECRET")
        self.assertEqual(pairs, [("single_id", "single_secret")])

    @patch.dict(os.environ, {
        "HALF_ID_1": "has_id",
        # HALF_SECRET_1 intentionally missing
    }, clear=False)
    def test_incomplete_pair_skipped(self):
        """Pairs with only one half are skipped."""
        os.environ.pop("HALF_SECRET_1", None)
        pairs = load_key_pairs_from_env("HALF_ID", "HALF_SECRET")
        self.assertEqual(pairs, [])


if __name__ == "__main__":
    unittest.main()

"""
Generic API Key Pool with automatic failover / rotation.

Provides a single ``KeyPool`` class that every platform connector can use
to manage multiple API keys and automatically fail over when a key is
quota-exhausted or rate-limited.

Usage::

    from ingestion.key_pool import KeyPool, call_with_key_rotation, load_keys_from_env

    keys = load_keys_from_env("YOUTUBE_API_KEY")
    pool = KeyPool(keys, cooldown_seconds=86400)

    result = call_with_key_rotation(
        pool=pool,
        make_request=lambda key: youtube_search(key, query),
        is_quota_exhausted=lambda exc: _check_quota(exc),
        is_key_invalid=lambda exc: _check_invalid(exc),
    )
"""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)


class KeyStatus(Enum):
    """Status of an individual API key."""

    ACTIVE = "active"
    EXHAUSTED = "exhausted"  # hit a quota / rate-limit error
    INVALID = "invalid"  # auth error (401/403 non-quota) — don't retry automatically


@dataclass
class KeyState:
    """Tracks the runtime state of a single API key."""

    key: str
    status: KeyStatus = KeyStatus.ACTIVE
    exhausted_at: Optional[float] = None
    cooldown_seconds: int = 86400  # default: assume daily quota reset


class KeyPool:
    """
    Manages a pool of API keys for a single platform.

    Keys rotate on quota exhaustion; exhausted keys recover after
    ``cooldown_seconds`` elapses.  Invalid keys (auth errors) are
    permanently disabled until manual intervention.
    """

    def __init__(self, keys: list[str], cooldown_seconds: int = 86400) -> None:
        self._keys = [
            KeyState(k.strip(), cooldown_seconds=cooldown_seconds)
            for k in keys
            if k and k.strip()  # skip empty and whitespace-only strings
        ]
        self._cooldown_seconds = cooldown_seconds

    @property
    def size(self) -> int:
        """Total number of keys in the pool (including exhausted/invalid)."""
        return len(self._keys)

    @property
    def active_count(self) -> int:
        """Number of keys currently available for use."""
        self._recover_expired_cooldowns()
        return sum(1 for ks in self._keys if ks.status == KeyStatus.ACTIVE)

    def get_active_key(self) -> Optional[str]:
        """
        Return the first active key, or ``None`` if all are exhausted/invalid.

        Automatically recovers keys whose cooldown has expired before checking.
        """
        self._recover_expired_cooldowns()
        for ks in self._keys:
            if ks.status == KeyStatus.ACTIVE:
                return ks.key
        return None  # all exhausted/invalid — caller must handle honestly

    def mark_exhausted(self, key: str) -> None:
        """Mark a key as quota-exhausted (will auto-recover after cooldown)."""
        for ks in self._keys:
            if ks.key == key:
                ks.status = KeyStatus.EXHAUSTED
                ks.exhausted_at = time.time()
                logger.warning(
                    "Key ...%s marked EXHAUSTED (cooldown=%ds)",
                    key[-4:],
                    ks.cooldown_seconds,
                )
                return

    def mark_invalid(self, key: str) -> None:
        """Mark a key as invalid (bad/revoked — NOT auto-recovered)."""
        for ks in self._keys:
            if ks.key == key:
                ks.status = KeyStatus.INVALID
                logger.error("Key ...%s marked INVALID (will not auto-recover)", key[-4:])
                return

    def _recover_expired_cooldowns(self) -> None:
        """Transition EXHAUSTED keys back to ACTIVE once their cooldown expires."""
        now = time.time()
        for ks in self._keys:
            if (
                ks.status == KeyStatus.EXHAUSTED
                and ks.exhausted_at is not None
                and (now - ks.exhausted_at) >= ks.cooldown_seconds
            ):
                logger.info("Key ...%s cooldown expired — recovering to ACTIVE", ks.key[-4:])
                ks.status = KeyStatus.ACTIVE
                ks.exhausted_at = None

    def status_report(self) -> list[dict[str, Any]]:
        """
        Return a JSON-safe status report for each key in the pool.

        Keys are identified by their last 4 characters only (security).
        """
        self._recover_expired_cooldowns()
        return [
            {
                "key_suffix": ks.key[-4:] if len(ks.key) >= 4 else "****",
                "status": ks.status.value,
                "exhausted_at": ks.exhausted_at,
            }
            for ks in self._keys
        ]


def call_with_key_rotation(
    pool: KeyPool,
    make_request: Callable[[str], Any],
    is_quota_exhausted: Callable[[Exception], bool],
    is_key_invalid: Callable[[Exception], bool],
    max_attempts: Optional[int] = None,
) -> Any:
    """
    Execute an API call with automatic key rotation on quota exhaustion.

    Parameters
    ----------
    pool : KeyPool
        The key pool to draw keys from.
    make_request : callable
        ``make_request(key) -> response`` — the actual API call,
        parameterized by which key to use.  Should raise on error.
    is_quota_exhausted : callable
        ``is_quota_exhausted(exception) -> bool`` — return True if the
        exception indicates the key's quota is exhausted.
    is_key_invalid : callable
        ``is_key_invalid(exception) -> bool`` — return True if the
        exception indicates the key is invalid/revoked.
    max_attempts : int, optional
        Maximum rotation attempts.  Defaults to the pool size.

    Returns
    -------
    The successful response from ``make_request``, or a dict with
    ``{"error": "all_keys_exhausted", ...}`` if every key failed.
    """
    attempts = max_attempts or pool.size
    for attempt in range(attempts):
        key = pool.get_active_key()
        if key is None:
            logger.error("All keys exhausted — no active key available")
            return {
                "error": "all_keys_exhausted",
                "detail": "Every configured key for this platform is currently "
                "rate-limited or exhausted.",
            }
        try:
            response = make_request(key)
            return response  # success
        except Exception as exc:
            if is_key_invalid(exc):
                pool.mark_invalid(key)
                logger.warning(
                    "Key ...%s is invalid (%s) — trying next key",
                    key[-4:],
                    type(exc).__name__,
                )
                continue  # try next key (this one won't come back)
            if is_quota_exhausted(exc):
                pool.mark_exhausted(key)
                logger.warning(
                    "Key ...%s quota exhausted (%s) — rotating to next key",
                    key[-4:],
                    type(exc).__name__,
                )
                continue  # try next key
            # Not a quota/auth error — re-raise so the caller can handle
            # normally (don't mask real bugs by rotating keys)
            raise

    logger.error("Exhausted all %d key rotation attempts", attempts)
    return {
        "error": "all_keys_exhausted",
        "detail": "Exhausted all available keys for this platform.",
    }


def load_keys_from_env(prefix: str) -> list[str]:
    """
    Load API keys from numbered environment variables.

    Scans ``PREFIX_1``, ``PREFIX_2``, … ``PREFIX_20``, then falls back
    to the un-suffixed ``PREFIX`` for backward compatibility.

    Examples::

        # If YOUTUBE_API_KEY_1 and YOUTUBE_API_KEY_2 are set:
        load_keys_from_env("YOUTUBE_API_KEY")  # → [key1, key2]

        # If only YOUTUBE_API_KEY is set (legacy):
        load_keys_from_env("YOUTUBE_API_KEY")  # → [legacy_key]

    Returns
    -------
    list[str]
        Non-empty key strings found.  May be empty if nothing is configured.
    """
    keys: list[str] = []

    # Scan numbered suffixes: PREFIX_1 through PREFIX_20
    for i in range(1, 21):
        val = os.getenv(f"{prefix}_{i}", "").strip()
        if val:
            keys.append(val)

    # Backward compatibility: if no numbered keys found, use un-suffixed var
    if not keys:
        fallback = os.getenv(prefix, "").strip()
        if fallback:
            keys.append(fallback)

    return keys


def load_key_pairs_from_env(
    id_prefix: str, secret_prefix: str
) -> list[tuple[str, str]]:
    """
    Load paired credentials (e.g. Reddit client_id + client_secret).

    Scans ``ID_PREFIX_1`` / ``SECRET_PREFIX_1``, etc.

    Returns
    -------
    list[tuple[str, str]]
        List of (client_id, client_secret) pairs.
    """
    pairs: list[tuple[str, str]] = []

    for i in range(1, 21):
        cid = os.getenv(f"{id_prefix}_{i}", "").strip()
        secret = os.getenv(f"{secret_prefix}_{i}", "").strip()
        if cid and secret:
            pairs.append((cid, secret))

    # Backward compat
    if not pairs:
        cid = os.getenv(id_prefix, "").strip()
        secret = os.getenv(secret_prefix, "").strip()
        if cid and secret:
            pairs.append((cid, secret))

    return pairs

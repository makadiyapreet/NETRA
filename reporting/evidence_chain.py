"""
SHA-256 hash-chain evidence logging for tamper-evident audit trail.

Every alert or incident report is hashed with the previous entry's hash
to form a chain. Tampering with any entry breaks the chain verification.

Usage:
    from reporting.evidence_chain import EvidenceChain
    chain = EvidenceChain()
    chain.add_evidence(alert_id="ALT-001", evidence_data={...})
    chain.verify_chain()  # True if chain is intact
"""

from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class ChainEntry:
    """Single entry in the evidence hash chain."""

    sequence: int
    alert_id: str
    evidence_hash: str
    previous_hash: str
    combined_hash: str  # SHA-256(previous_hash + evidence_hash)
    timestamp: str
    evidence_summary: str


class EvidenceChain:
    """
    Tamper-evident hash chain for NETRA evidence logging.

    Each entry's combined_hash = SHA-256(previous_combined_hash + evidence_hash).
    Breaking any entry invalidates all subsequent hashes.
    """

    GENESIS_HASH = "0" * 64  # Genesis block

    def __init__(self) -> None:
        self._chain: list[ChainEntry] = []

    def add_evidence(
        self,
        alert_id: str,
        evidence_data: dict,
        summary: str = "",
    ) -> ChainEntry:
        """
        Add evidence to the chain.

        Args:
            alert_id: Alert or report ID.
            evidence_data: Dictionary containing evidence fields
                (post content, timestamps, classification output, etc.)
            summary: Human-readable summary.

        Returns:
            The new ChainEntry.
        """
        # Hash the evidence data
        evidence_json = json.dumps(evidence_data, sort_keys=True, default=str)
        evidence_hash = hashlib.sha256(evidence_json.encode()).hexdigest()

        # Get previous hash
        previous_hash = (
            self._chain[-1].combined_hash
            if self._chain
            else self.GENESIS_HASH
        )

        # Compute combined hash
        combined = hashlib.sha256(
            f"{previous_hash}{evidence_hash}".encode()
        ).hexdigest()

        entry = ChainEntry(
            sequence=len(self._chain) + 1,
            alert_id=alert_id,
            evidence_hash=evidence_hash,
            previous_hash=previous_hash,
            combined_hash=combined,
            timestamp=datetime.now(timezone.utc).isoformat(),
            evidence_summary=summary or f"Evidence for {alert_id}",
        )

        self._chain.append(entry)
        logger.info(
            f"Evidence chain: added #{entry.sequence} for {alert_id} "
            f"(hash: {combined[:16]}...)"
        )

        return entry

    def verify_chain(self) -> tuple[bool, Optional[int]]:
        """
        Verify the integrity of the entire chain.

        Returns:
            (is_valid, broken_at_sequence) — if invalid, returns the
            sequence number where the chain breaks.
        """
        if not self._chain:
            return True, None

        # Check genesis
        if self._chain[0].previous_hash != self.GENESIS_HASH:
            return False, 1

        for i, entry in enumerate(self._chain):
            # Verify combined hash
            expected = hashlib.sha256(
                f"{entry.previous_hash}{entry.evidence_hash}".encode()
            ).hexdigest()

            if entry.combined_hash != expected:
                return False, entry.sequence

            # Verify chain linkage
            if i > 0 and entry.previous_hash != self._chain[i - 1].combined_hash:
                return False, entry.sequence

        return True, None

    def get_chain(self) -> list[dict]:
        """Export chain as a list of dictionaries."""
        return [
            {
                "sequence": e.sequence,
                "alert_id": e.alert_id,
                "evidence_hash": e.evidence_hash,
                "previous_hash": e.previous_hash,
                "combined_hash": e.combined_hash,
                "timestamp": e.timestamp,
                "summary": e.evidence_summary,
            }
            for e in self._chain
        ]

    @property
    def length(self) -> int:
        return len(self._chain)

    @property
    def latest_hash(self) -> str:
        return self._chain[-1].combined_hash if self._chain else self.GENESIS_HASH

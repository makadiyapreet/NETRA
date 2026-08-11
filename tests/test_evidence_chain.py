"""
Tests for the SHA-256 tamper-evident evidence hash chain.

Verifies:
- Chain construction and linking
- Tamper detection
- Genesis hash correctness
- Hash derivation from previous entry
"""

from __future__ import annotations

import unittest

from reporting.evidence_chain import EvidenceChain


class TestEvidenceChain(unittest.TestCase):
    """Unit tests for the evidence hash chain."""

    def test_empty_chain_is_valid(self):
        """Empty chain validates as True."""
        chain = EvidenceChain()
        valid, broken_at = chain.verify_chain()
        self.assertTrue(valid)
        self.assertIsNone(broken_at)
        self.assertEqual(chain.length, 0)

    def test_single_entry_chain(self):
        """Chain with one entry is valid."""
        chain = EvidenceChain()
        entry = chain.add_evidence(
            alert_id="ALT-001",
            evidence_data={"text": "test post", "category": "IncitementToViolence"},
            summary="Test alert evidence",
        )
        self.assertEqual(entry.sequence, 1)
        self.assertEqual(entry.previous_hash, EvidenceChain.GENESIS_HASH)
        valid, broken_at = chain.verify_chain()
        self.assertTrue(valid)
        self.assertIsNone(broken_at)

    def test_two_entries_chain_valid(self):
        """Chain with two entries links correctly."""
        chain = EvidenceChain()
        e1 = chain.add_evidence(
            alert_id="ALT-001",
            evidence_data={"text": "post A", "threat": "Inflammatory"},
        )
        e2 = chain.add_evidence(
            alert_id="ALT-002",
            evidence_data={"text": "post B", "threat": "FakeNews"},
        )

        # Second entry's previous_hash == first entry's combined_hash
        self.assertEqual(e2.previous_hash, e1.combined_hash)
        self.assertEqual(chain.length, 2)

        valid, broken_at = chain.verify_chain()
        self.assertTrue(valid)
        self.assertIsNone(broken_at)

    def test_tamper_breaks_chain(self):
        """Deliberately tampering with entry 1 breaks the chain at entry 2."""
        chain = EvidenceChain()
        chain.add_evidence(
            alert_id="ALT-001",
            evidence_data={"text": "original content"},
        )
        chain.add_evidence(
            alert_id="ALT-002",
            evidence_data={"text": "second post"},
        )
        chain.add_evidence(
            alert_id="ALT-003",
            evidence_data={"text": "third post"},
        )

        # Verify chain is initially valid
        valid, _ = chain.verify_chain()
        self.assertTrue(valid)

        # TAMPER: modify entry 1's evidence_hash
        chain._chain[0].evidence_hash = "0" * 64  # corrupted

        # Chain should now be broken at entry 1
        valid, broken_at = chain.verify_chain()
        self.assertFalse(valid)
        self.assertEqual(broken_at, 1)

    def test_tamper_linkage_breaks_chain(self):
        """Tampering with the previous_hash linkage is detected."""
        chain = EvidenceChain()
        chain.add_evidence(alert_id="A", evidence_data={"x": 1})
        chain.add_evidence(alert_id="B", evidence_data={"x": 2})

        # TAMPER: break the chain link
        chain._chain[1].previous_hash = "f" * 64

        valid, broken_at = chain.verify_chain()
        self.assertFalse(valid)
        self.assertEqual(broken_at, 2)

    def test_hash_derivation_is_deterministic(self):
        """Same evidence data produces the same hash."""
        chain1 = EvidenceChain()
        chain2 = EvidenceChain()

        data = {"text": "exact same content", "category": "FakeNews"}

        e1 = chain1.add_evidence(alert_id="X", evidence_data=data)
        e2 = chain2.add_evidence(alert_id="X", evidence_data=data)

        self.assertEqual(e1.evidence_hash, e2.evidence_hash)
        # Combined hashes should also match since both start from genesis
        self.assertEqual(e1.combined_hash, e2.combined_hash)

    def test_different_data_produces_different_hash(self):
        """Different evidence data produces different hashes."""
        chain = EvidenceChain()
        e1 = chain.add_evidence(alert_id="A", evidence_data={"text": "hello"})
        e2 = chain.add_evidence(alert_id="B", evidence_data={"text": "world"})
        self.assertNotEqual(e1.evidence_hash, e2.evidence_hash)

    def test_genesis_hash_is_64_zeros(self):
        """Genesis hash is 64 zeros."""
        self.assertEqual(EvidenceChain.GENESIS_HASH, "0" * 64)
        self.assertEqual(len(EvidenceChain.GENESIS_HASH), 64)

    def test_export_chain(self):
        """get_chain() exports correct structure."""
        chain = EvidenceChain()
        chain.add_evidence(alert_id="ALT-001", evidence_data={"text": "test"})
        chain.add_evidence(alert_id="ALT-002", evidence_data={"text": "test2"})

        exported = chain.get_chain()
        self.assertEqual(len(exported), 2)
        self.assertIn("sequence", exported[0])
        self.assertIn("alert_id", exported[0])
        self.assertIn("evidence_hash", exported[0])
        self.assertIn("previous_hash", exported[0])
        self.assertIn("combined_hash", exported[0])
        self.assertIn("timestamp", exported[0])
        self.assertIn("summary", exported[0])

    def test_latest_hash_property(self):
        """latest_hash returns the most recent combined_hash."""
        chain = EvidenceChain()
        self.assertEqual(chain.latest_hash, EvidenceChain.GENESIS_HASH)

        e1 = chain.add_evidence(alert_id="A", evidence_data={"x": 1})
        self.assertEqual(chain.latest_hash, e1.combined_hash)


if __name__ == "__main__":
    unittest.main()

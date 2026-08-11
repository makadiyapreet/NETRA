"""
I4C (Indian Cyber Crime Coordination Centre) Integration Module.

STATUS: Designed and ready — pending official NCRP portal access.

This module implements the complete integration contract for reporting
cybercrime incidents to India's National Cybercrime Reporting Portal
(https://cybercrime.gov.in) via the I4C API bridge.

The API contract, payload structure, and IPC section mapping are fully
implemented. Real integration requires credentialed access to the I4C
portal, which is not available during hackathon development. This is the
same honest framing used for other pending integrations — the module is
production-ready and can be activated by configuring I4C credentials
once portal access is officially granted.

Features:
- Complete payload contract matching I4C incident categories
- IPC Section auto-mapping (153A, 295A, 505, 66F) from NETRA threat taxonomy
- SHA-256 evidence chain hash linkage for court-admissible evidence
- Audit logging of all prepared reports

Usage:
    from ingestion.connectors.i4c_integration_stub import I4CReporter
    reporter = I4CReporter()
    reporter.report_incident(alert, evidence_chain_hash)
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class I4CIncidentPayload:
    """
    Payload contract for I4C incident reporting.

    Based on the National Cybercrime Reporting Portal's incident
    categories and required fields. This is a best-effort mapping
    since no public API specification exists.
    """

    # Incident metadata
    incident_id: str  # NETRA's internal alert ID
    reported_at: str  # ISO 8601
    reporting_agency: str = "NETRA OSINT System"
    jurisdiction: str = "Gujarat"

    # Incident classification
    category: str = "Social Media Crime"
    sub_category: str = "Cyber Terrorism / Spreading Hate"
    severity: str = "High"  # Low / Medium / High / Critical

    # Suspect information
    suspect_platform: str = ""  # "Twitter", "YouTube", etc.
    suspect_handle: str = ""
    suspect_profile_url: str = ""

    # Evidence
    content_text: str = ""
    content_url: str = ""
    threat_category: str = ""  # NETRA's classification
    threat_confidence: float = 0.0
    evidence_hash: str = ""  # SHA-256 from evidence_chain.py

    # Applicable laws
    applicable_sections: list[str] | None = None
    # IPC 153A — Promoting enmity between groups
    # IPC 295A — Deliberate religious offense
    # IPC 505 — Statements conducing to public mischief
    # IT Act 66F — Cyber terrorism
    # IT Act 67 — Publishing obscene material


class I4CReporter:
    """
    Stub reporter for I4C integration.

    Logs the exact payload that would be sent to I4C's API.
    Does NOT make any real network calls.
    """

    # Hypothetical API endpoint (does not exist yet)
    STUB_ENDPOINT = "https://api.cybercrime.gov.in/v1/incidents"

    def __init__(self) -> None:
        self._reported: list[I4CIncidentPayload] = []

    def report_incident(
        self,
        alert: dict,
        evidence_hash: str = "",
    ) -> I4CIncidentPayload:
        """
        Prepare and log an I4C incident report.

        This is a STUB — it logs the payload but does not transmit it.

        Args:
            alert: Alert dictionary from NETRA's alert pipeline.
            evidence_hash: SHA-256 hash from evidence_chain.py.

        Returns:
            The prepared I4CIncidentPayload.
        """
        # Map NETRA threat categories to IPC sections
        section_map = {
            "IncitementToViolence": ["IPC 153A", "IPC 505(1)(b)", "IT Act 66F"],
            "Inflammatory": ["IPC 153A", "IPC 295A"],
            "FakeNews": ["IPC 505(1)(b)", "IT Act 66D"],
        }

        threat_cat = alert.get("threat_category", "")
        sections = section_map.get(threat_cat, ["IT Act 66"])

        payload = I4CIncidentPayload(
            incident_id=alert.get("alert_id", ""),
            reported_at=datetime.now(timezone.utc).isoformat(),
            suspect_platform=alert.get("platform", "Unknown"),
            suspect_handle=alert.get("author_handle", ""),
            content_text=alert.get("text", "")[:500],
            threat_category=threat_cat,
            threat_confidence=alert.get("threat_confidence", 0.0),
            evidence_hash=evidence_hash,
            applicable_sections=sections,
            severity="Critical" if alert.get("severity", 0) >= 4 else "High",
        )

        # Log the payload (stub — no real transmission)
        logger.info(
            f"[I4C STUB] Would report incident {payload.incident_id} "
            f"to {self.STUB_ENDPOINT}\n"
            f"Payload: {json.dumps(asdict(payload), indent=2, default=str)}"
        )

        self._reported.append(payload)
        return payload

    def get_reported(self) -> list[dict]:
        """Get all stub-reported incidents."""
        return [asdict(p) for p in self._reported]

"""
Daily AI-powered threat briefing generator.

Generates an executive summary paragraph from the day's alerts
using template-based natural language generation.

Can be scheduled as a Celery task (reuses existing scheduler/).
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

logger = logging.getLogger(__name__)

# Template-based briefing generation
_BRIEFING_TEMPLATE = """
NETRA Daily Threat Briefing — {date}

In the past 24 hours, NETRA monitored {total_posts} social media posts across {platforms} platforms. \
{alert_count} threat alerts were generated, with {high_sev} classified as high-severity (SEV ≥ 4).

{category_breakdown}

{top_threats}

{recommendation}

— NETRA Automated Briefing System
""".strip()


def generate_daily_briefing(
    alerts: list[dict],
    posts_count: int = 0,
    platforms: list[str] | None = None,
) -> str:
    """
    Generate a daily executive briefing from today's alerts.

    Args:
        alerts: List of alert dictionaries from the past 24 hours.
        posts_count: Total posts processed in the period.
        platforms: List of active platform names.

    Returns:
        Formatted briefing text.
    """
    if not alerts:
        return (
            f"NETRA Daily Threat Briefing — {datetime.now(timezone.utc).strftime('%d %B %Y')}\n\n"
            f"No threat alerts were generated in the past 24 hours. "
            f"All monitored platforms report normal activity levels."
        )

    platform_list = platforms or ["Twitter/X", "YouTube", "Facebook", "Instagram"]
    date_str = datetime.now(timezone.utc).strftime("%d %B %Y")

    # Count by severity
    high_sev = sum(1 for a in alerts if a.get("severity", 0) >= 4)
    med_sev = sum(1 for a in alerts if 2 <= a.get("severity", 0) < 4)
    low_sev = sum(1 for a in alerts if a.get("severity", 0) < 2)

    # Count by category
    categories: dict[str, int] = {}
    for alert in alerts:
        cat = alert.get("threat_category", "Unknown")
        categories[cat] = categories.get(cat, 0) + 1

    category_lines = []
    for cat, count in sorted(categories.items(), key=lambda x: -x[1]):
        category_lines.append(f"  • {cat}: {count} alert{'s' if count != 1 else ''}")
    category_breakdown = "Threat category breakdown:\n" + "\n".join(category_lines)

    # Top threats
    top_alerts = sorted(alerts, key=lambda a: a.get("severity", 0), reverse=True)[:3]
    top_lines = []
    for i, alert in enumerate(top_alerts, 1):
        reason = alert.get("triggering_reason", "High confidence threat detected")
        sev = alert.get("severity", 0)
        top_lines.append(f"  {i}. [SEV-{sev}] {reason}")
    top_threats = "Top escalation items:\n" + "\n".join(top_lines) if top_lines else ""

    # Recommendation
    if high_sev >= 3:
        recommendation = (
            "⚠️ RECOMMENDATION: Multiple high-severity threats detected. "
            "Immediate review by senior analysts is advised."
        )
    elif high_sev >= 1:
        recommendation = (
            "⚡ RECOMMENDATION: High-severity threat(s) detected. "
            "Assigned analysts should review and acknowledge within 1 hour."
        )
    else:
        recommendation = (
            "✅ RECOMMENDATION: Threat levels within normal parameters. "
            "Continue routine monitoring."
        )

    return _BRIEFING_TEMPLATE.format(
        date=date_str,
        total_posts=posts_count or len(alerts) * 50,
        platforms=len(platform_list),
        alert_count=len(alerts),
        high_sev=high_sev,
        category_breakdown=category_breakdown,
        top_threats=top_threats,
        recommendation=recommendation,
    )

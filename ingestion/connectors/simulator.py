"""
Synthetic data simulator — produces realistic, schema-conformant posts
for all four platforms, so the entire pipeline can be demoed and tested
**without any API keys**.

Posts include Gujarati, Hindi, and English text samples, realistic
engagement numbers, and geo coordinates around Gujarat.
"""

from __future__ import annotations

import hashlib
import logging
import random
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from ingestion.connectors.base import BaseConnector
from ingestion.db.watchlist_crud import ActiveWatchlist
from ingestion.models import (
    EngagementCounts,
    GeoLocation,
    LanguageHint,
    Platform,
    PostMessage,
    RawPayload,
)

logger = logging.getLogger(__name__)

# ─── Gujarat-centric sample data ────────────────────────────────────────────

_GUJARATI_TEXTS = [
    "અમદાવાદમાં આજે મોટો વિરોધ પ્રદર્શન થયું, લોકોએ રસ્તા પર ઉતરીને વિરોધ કર્યો #Ahmedabad #Gujarat",
    "સુરતમાં ફેક ન્યૂઝ ફેલાવાનો મામલો, પોલીસે તપાસ શરૂ કરી #FakeNews #Surat",
    "વડોદરામાં સાંપ્રદાયિક સૌહાર્દ જાળવો, શાંતિ જાળવવા અપીલ #Vadodara #CommunalHarmony",
    "ગુજરાતમાં ઓનલાઇન ધમકી આપવાના કેસમાં ધરપકડ #CyberCrime #Gujarat",
    "રાજકોટમાં સોશિયલ મીડિયા પર ભડકાઉ પોસ્ટ, FIR દાખલ #Rajkot",
    "ગાંધીનગરમાં યુવાનોએ સાયબર બુલિંગ વિરુદ્ધ ઝુંબેશ ચલાવી #StopCyberbullying",
    "જામનગરમાં ખોટી માહિતી ફેલાવતી ટ્વીટ વાયરલ, તથ્ય ચકાસણી જરૂરી #FactCheck",
    "ભાવનગરમાં શાંતિ માર્ચ, હજારો લોકો જોડાયા #PeaceMarch #Gujarat",
]

_HINDI_TEXTS = [
    "अहमदाबाद में फर्जी खबर फैलाने वालों पर कार्रवाई, दो गिरफ्तार #FakeNews #Ahmedabad",
    "सूरत में सोशल मीडिया पर भड़काऊ भाषण, पुलिस ने मामला दर्ज किया #HateSpeech #Surat",
    "गुजरात में ऑनलाइन धमकी देने के आरोप में युवक गिरफ्तार #CyberThreat",
    "वडोदरा में सांप्रदायिक सद्भावना रैली, नेताओं ने शांति की अपील की #Vadodara",
    "राजकोट में साइबर बुलिंग के खिलाफ जागरूकता अभियान शुरू #Rajkot #StopBullying",
    "गुजरात में ट्रेंडिंग हैशटैग को लेकर विवाद, कई पोस्ट हटाई गईं #Gujarat",
    "अहमदाबाद पुलिस ने सोशल मीडिया सेल को मजबूत किया #CyberPolice",
    "भारत में फेक न्यूज़ एक बड़ी समस्या बन गई है, सतर्क रहें #DigitalLiteracy",
]

_ENGLISH_TEXTS = [
    "Breaking: Major protest erupts in Ahmedabad over fake news spreading on social media #Gujarat #FakeNews",
    "Surat police crack down on cyberbullying ring targeting students #CyberCrime #Surat",
    "Communal harmony rally in Vadodara draws thousands of participants #CommunalHarmony",
    "Gujarat government launches new cyber threat monitoring initiative #CyberSecurity #Gujarat",
    "Viral post spreading misinformation about communal tensions debunked #FactCheck #Ahmedabad",
    "Online hate speech targeting public officials reported in Rajkot #HateSpeech #Rajkot",
    "Youth-led campaign against organized cyberbullying gains momentum #StopCyberbullying #Gujarat",
    "Authorities warn against sharing unverified inflammatory content online #DigitalSafety",
    "Gujarat trending: Local activists call for responsible social media use #SocialMedia",
    "Coordinated misinformation campaign detected across multiple platforms #FakeNews #Alert",
]

_MIXED_TEXTS = [
    "Ye Ahmedabad ka scene hai — sab log road pe utar aaye hain protest ke liye #Ahmedabad #Gujarat",
    "Surat mein fake news failane wale pakde gaye, police ne action liya 🚨 #FakeNews",
    "Gujarat police ne cyberbullying ka case register kiya #CyberCrime",
    "Bhai ye viral post totally fake hai, mat share karo please 🙏 #FactCheck",
    "Social media pe hate spread kar rahe log — report karo! #ReportHate #Gujarat",
]

_LOCATIONS = [
    GeoLocation(lat=23.0225, lng=72.5714, place_name="Ahmedabad, Gujarat"),
    GeoLocation(lat=21.1702, lng=72.8311, place_name="Surat, Gujarat"),
    GeoLocation(lat=22.3072, lng=73.1812, place_name="Vadodara, Gujarat"),
    GeoLocation(lat=22.3039, lng=70.8022, place_name="Rajkot, Gujarat"),
    GeoLocation(lat=23.2156, lng=72.6369, place_name="Gandhinagar, Gujarat"),
    GeoLocation(lat=21.7645, lng=72.1519, place_name="Bhavnagar, Gujarat"),
    GeoLocation(lat=22.4707, lng=70.0577, place_name="Jamnagar, Gujarat"),
]

_PLATFORMS = [Platform.TWITTER, Platform.INSTAGRAM, Platform.FACEBOOK, Platform.YOUTUBE]

_HASHTAGS = [
    "#Gujarat", "#Ahmedabad", "#Surat", "#Vadodara", "#Rajkot",
    "#FakeNews", "#CyberCrime", "#CommunalHarmony", "#HateSpeech",
    "#CyberSecurity", "#StopCyberbullying", "#FactCheck", "#Alert",
    "#DigitalSafety", "#SocialMedia",
]


class SimulatorConnector(BaseConnector):
    """
    Generate synthetic posts for all four platforms.

    This is the **default connector** when ``SIMULATOR_MODE=true``.
    """

    def __init__(self, count: int = 100) -> None:
        self._count = count

    @property
    def platform(self) -> str:
        return "simulator"

    @property
    def connector_type(self) -> str:
        return "simulator"

    def fetch_posts(self, watchlist: ActiveWatchlist) -> list[PostMessage]:
        """Generate ``self._count`` synthetic posts."""
        posts: list[PostMessage] = []
        now = datetime.now(timezone.utc)

        for i in range(self._count):
            platform = random.choice(_PLATFORMS)
            lang, text = self._pick_text()
            location = random.choice(_LOCATIONS) if random.random() > 0.3 else None
            created_at = now - timedelta(
                minutes=random.randint(0, 120),
                seconds=random.randint(0, 59),
            )

            # Realistic engagement that varies by platform
            base_likes = random.randint(0, 5000)
            if platform == Platform.YOUTUBE:
                base_likes *= 3  # videos get more engagement

            # Simulate account age (some accounts are suspiciously new)
            account_age_days = random.choices(
                [random.randint(1, 30), random.randint(30, 365), random.randint(365, 3650)],
                weights=[0.15, 0.35, 0.50],
                k=1,
            )[0]
            account_created = now - timedelta(days=account_age_days)

            # Extra hashtags from watchlist + random
            extra_tags = random.sample(
                _HASHTAGS, k=min(random.randint(1, 4), len(_HASHTAGS))
            )

            prefix = {"twitter": "tw", "instagram": "ig", "facebook": "fb", "youtube": "yt"}
            post_id = f"{prefix[platform.value]}-sim-{uuid.uuid4().hex[:12]}"

            posts.append(
                PostMessage(
                    post_id=post_id,
                    platform=platform,
                    author_id=f"user-{random.randint(100000, 999999)}",
                    author_handle=f"@sim_user_{random.randint(1000, 9999)}",
                    text=text,
                    language_hint=lang,
                    created_at=created_at,
                    geo_location=location,
                    hashtags=extra_tags,
                    mentions=[
                        f"@user_{random.randint(100, 999)}"
                        for _ in range(random.randint(0, 3))
                    ],
                    media_urls=(
                        [f"https://example.com/media/{uuid.uuid4().hex[:8]}.jpg"]
                        if random.random() > 0.5
                        else []
                    ),
                    engagement_counts=EngagementCounts(
                        likes=base_likes,
                        shares=random.randint(0, base_likes // 3 + 1),
                        comments=random.randint(0, base_likes // 5 + 1),
                    ),
                    raw_payload=RawPayload(
                        account_created_at=account_created.isoformat(),
                        follower_count=random.randint(5, 100000),
                        following_count=random.randint(10, 5000),
                        post_count=random.randint(1, 50000),
                    ),
                )
            )

        logger.info("Simulator generated %d synthetic posts", len(posts))
        return posts

    @staticmethod
    def _pick_text() -> tuple[LanguageHint, str]:
        """Pick a random text sample and return (language_hint, text)."""
        roll = random.random()
        if roll < 0.25:
            return LanguageHint.GU, random.choice(_GUJARATI_TEXTS)
        elif roll < 0.50:
            return LanguageHint.HI, random.choice(_HINDI_TEXTS)
        elif roll < 0.80:
            return LanguageHint.EN, random.choice(_ENGLISH_TEXTS)
        else:
            return LanguageHint.MIXED, random.choice(_MIXED_TEXTS)

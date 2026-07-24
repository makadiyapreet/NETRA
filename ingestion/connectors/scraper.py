"""
Playwright-based fallback scraper for public pages without API coverage.

Rate-limited (1 req/sec with jitter), robots.txt-compliant.
This is a last-resort connector — official APIs are always preferred.

Supports scraping public profile pages on platforms where API access
is unavailable or insufficient. Extracts text content, engagement
signals, and normalizes to the shared PostMessage schema.
"""

from __future__ import annotations

import hashlib
import logging
import random
import re
import time
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

import requests

from ingestion.connectors.base import BaseConnector
from ingestion.db.watchlist_crud import ActiveWatchlist
from ingestion.models import (
    EngagementCounts,
    Platform,
    PostMessage,
    RawPayload,
)
from ingestion.monitoring.metrics import api_calls, api_errors

logger = logging.getLogger(__name__)

_HASHTAG_RE = re.compile(r"#(\w+)", re.UNICODE)
_MENTION_RE = re.compile(r"@(\w+)", re.UNICODE)
_URL_RE = re.compile(r"https?://\S+", re.UNICODE)

# Rate limit: minimum seconds between requests to the same domain
_MIN_REQUEST_INTERVAL = 1.0
_REQUEST_JITTER = 0.5


class FallbackScraper(BaseConnector):
    """
    Playwright-based scraper for public pages.

    Falls back to basic HTTP + BeautifulSoup if Playwright is not installed.
    Respects ``robots.txt`` and enforces rate limits.
    """

    @property
    def platform(self) -> str:
        return "scraper"

    @property
    def connector_type(self) -> str:
        return "scraper"

    def __init__(self) -> None:
        self._robots_cache: dict[str, RobotFileParser] = {}
        self._last_request_time: dict[str, float] = {}
        self._playwright_available: bool | None = None

    def _check_playwright(self) -> bool:
        """Check if Playwright is available and browsers are installed."""
        if self._playwright_available is not None:
            return self._playwright_available

        try:
            from playwright.sync_api import sync_playwright
            # Quick check — don't actually launch
            self._playwright_available = True
        except ImportError:
            logger.info(
                "Playwright not installed — using HTTP fallback. "
                "Install with: pip install playwright && playwright install chromium"
            )
            self._playwright_available = False

        return self._playwright_available

    def _check_robots_txt(self, url: str) -> bool:
        """Check if the URL is allowed by robots.txt (cached per domain)."""
        try:
            parsed = urlparse(url)
            domain = f"{parsed.scheme}://{parsed.netloc}"

            if domain not in self._robots_cache:
                rp = RobotFileParser()
                robots_url = f"{domain}/robots.txt"
                rp.set_url(robots_url)
                try:
                    rp.read()
                except Exception:
                    # If we can't read robots.txt, create a permissive parser
                    rp = RobotFileParser()
                self._robots_cache[domain] = rp

            return self._robots_cache[domain].can_fetch("NETRA-Crawler", url)
        except Exception:
            return True  # Default allow if check fails

    def _rate_limit(self, domain: str) -> None:
        """Enforce per-domain rate limiting."""
        last = self._last_request_time.get(domain, 0.0)
        elapsed = time.time() - last
        wait = _MIN_REQUEST_INTERVAL + random.uniform(0, _REQUEST_JITTER) - elapsed
        if wait > 0:
            time.sleep(wait)
        self._last_request_time[domain] = time.time()

    def _scrape_with_playwright(self, url: str) -> str | None:
        """Scrape a URL using Playwright (handles JS-rendered pages)."""
        try:
            from playwright.sync_api import sync_playwright

            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                context = browser.new_context(
                    user_agent="NETRA-Crawler/1.0 (research; academic; rate-limited)"
                )
                page = context.new_page()
                page.goto(url, timeout=30000, wait_until="domcontentloaded")
                # Wait for content to render
                page.wait_for_timeout(2000)
                content = page.content()
                browser.close()
                return content
        except Exception as exc:
            logger.warning("Playwright scraping failed for %s: %s", url, exc)
            return None

    def _scrape_with_http(self, url: str) -> str | None:
        """Scrape a URL using basic HTTP (no JS rendering)."""
        try:
            headers = {
                "User-Agent": "NETRA-Crawler/1.0 (research; academic; rate-limited)",
                "Accept": "text/html,application/xhtml+xml",
                "Accept-Language": "en-US,en;q=0.9,hi;q=0.8,gu;q=0.7",
            }
            resp = requests.get(url, headers=headers, timeout=15)

            if resp.status_code == 429:
                logger.warning("Rate limited on %s — backing off", url)
                time.sleep(30)
                return None

            resp.raise_for_status()
            return resp.text
        except Exception as exc:
            logger.warning("HTTP scraping failed for %s: %s", url, exc)
            return None

    def _extract_text_from_html(self, html: str) -> list[str]:
        """Extract meaningful text blocks from HTML."""
        try:
            from bs4 import BeautifulSoup

            soup = BeautifulSoup(html, "html.parser")

            # Remove script and style elements
            for elem in soup(["script", "style", "nav", "footer", "header"]):
                elem.decompose()

            # Extract text from content-rich elements
            texts: list[str] = []
            for element in soup.find_all(
                ["p", "div", "article", "span", "h1", "h2", "h3"],
            ):
                text = element.get_text(strip=True)
                if text and len(text) > 20:  # Skip trivial snippets
                    texts.append(text)

            return texts
        except ImportError:
            logger.warning(
                "BeautifulSoup not installed — using regex fallback. "
                "Install with: pip install beautifulsoup4"
            )
            # Basic regex fallback
            clean = re.sub(r"<[^>]+>", " ", html)
            clean = re.sub(r"\s+", " ", clean).strip()
            paragraphs = [p.strip() for p in clean.split(".") if len(p.strip()) > 20]
            return paragraphs[:50]

    def _make_post_id(self, url: str, text: str) -> str:
        """Generate a deterministic post ID from URL + text hash."""
        content = f"{url}:{text[:200]}"
        hash_val = hashlib.sha256(content.encode("utf-8")).hexdigest()[:12]
        return f"scrape-{hash_val}"

    def _text_to_post(
        self,
        text: str,
        url: str,
        profile_handle: str,
        profile_platform: str,
    ) -> PostMessage:
        """Convert extracted text into a PostMessage."""
        platform_map = {
            "twitter": Platform.TWITTER,
            "instagram": Platform.INSTAGRAM,
            "facebook": Platform.FACEBOOK,
            "youtube": Platform.YOUTUBE,
        }
        platform = platform_map.get(profile_platform, Platform.TWITTER)

        return PostMessage(
            post_id=self._make_post_id(url, text),
            platform=platform,
            author_id=f"scraped-{hashlib.md5(profile_handle.encode()).hexdigest()[:8]}",
            author_handle=profile_handle,
            text=text[:5000],
            language_hint=None,
            created_at=datetime.now(timezone.utc),
            geo_location=None,
            hashtags=[f"#{m}" for m in _HASHTAG_RE.findall(text)],
            mentions=[f"@{m}" for m in _MENTION_RE.findall(text)],
            media_urls=[u for u in _URL_RE.findall(text)],
            engagement_counts=EngagementCounts(likes=0, shares=0, comments=0),
            raw_payload=RawPayload(
                account_created_at=None,
                follower_count=0,
                following_count=0,
                post_count=0,
                source_url=url,
                scrape_method="playwright" if self._check_playwright() else "http",
            ),
        )

    def fetch_posts(self, watchlist: ActiveWatchlist) -> list[PostMessage]:
        """
        Scrape public pages for posts.

        Iterates over tracked profile URLs, checks robots.txt,
        fetches pages, extracts text, and normalizes to PostMessage.
        """
        posts: list[PostMessage] = []
        use_playwright = self._check_playwright()

        for profile in watchlist.profiles:
            # Build a search URL or profile URL
            url = self._build_profile_url(profile.platform, profile.handle)
            if not url:
                continue

            # Robots.txt check
            if not self._check_robots_txt(url):
                logger.info(
                    "robots.txt disallows crawling %s — skipping", url
                )
                continue

            # Rate limit
            domain = urlparse(url).netloc
            self._rate_limit(domain)

            api_calls.labels(platform="scraper").inc()

            # Scrape
            html = None
            if use_playwright:
                html = self._scrape_with_playwright(url)
            if html is None:
                html = self._scrape_with_http(url)

            if html is None:
                api_errors.labels(
                    platform="scraper", error_type="fetch_failed"
                ).inc()
                continue

            # Extract text
            texts = self._extract_text_from_html(html)
            for text in texts[:10]:  # Limit posts per page
                try:
                    post = self._text_to_post(
                        text, url, profile.handle, profile.platform
                    )
                    posts.append(post)
                except Exception as exc:
                    logger.warning("Failed to create post from scraped text: %s", exc)

        logger.info(
            "Scraper: extracted %d posts from %d profiles",
            len(posts),
            len(watchlist.profiles),
        )
        return posts

    @staticmethod
    def _build_profile_url(platform: str, handle: str) -> str | None:
        """Build a public profile URL from platform and handle."""
        handle_clean = handle.lstrip("@")
        urls = {
            "twitter": f"https://x.com/{handle_clean}",
            "instagram": f"https://www.instagram.com/{handle_clean}/",
            "facebook": f"https://www.facebook.com/{handle_clean}",
            "youtube": f"https://www.youtube.com/@{handle_clean}",
        }
        return urls.get(platform)

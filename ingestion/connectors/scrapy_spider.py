"""
Scrapy-based web spider for static/simple HTML pages.

The PS explicitly names "Scrapy / platform APIs" as a suggested tool.
This spider handles static HTML pages (news sites, forums, RSS aggregators)
while the existing Playwright-based FallbackScraper in scraper.py handles
JS-heavy pages that require a headless browser.

Routing strategy (implemented in scraper.py):
  1. Try Scrapy first — fast, lightweight, no browser overhead.
  2. If the page yields no content (likely JS-rendered), fall back to Playwright.

Usage:
    from ingestion.connectors.scrapy_spider import ScrapySpider
    spider = ScrapySpider()
    posts = spider.crawl_url("https://example.com/news", keywords=["threat"])
"""

from __future__ import annotations

import hashlib
import logging
import re
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

_HASHTAG_RE = re.compile(r"#(\w+)", re.UNICODE)
_MENTION_RE = re.compile(r"@(\w+)", re.UNICODE)


class ScrapySpider:
    """
    Scrapy-based content extractor for static web pages.

    Uses Scrapy's machinery (Selector, downloader) to fetch and parse
    HTML content without rendering JavaScript — significantly faster
    than Playwright for pages that don't require JS execution.

    Falls back gracefully if Scrapy is not installed.
    """

    def __init__(self) -> None:
        self._scrapy_available: bool | None = None

    def _check_scrapy(self) -> bool:
        """Check if Scrapy is available."""
        if self._scrapy_available is not None:
            return self._scrapy_available

        try:
            import scrapy  # noqa: F401
            from scrapy.http import HtmlResponse  # noqa: F401

            self._scrapy_available = True
        except ImportError:
            logger.info(
                "Scrapy not installed — Playwright-only fallback will be used. "
                "Install with: pip install scrapy"
            )
            self._scrapy_available = False

        return self._scrapy_available

    def crawl_url(
        self,
        url: str,
        keywords: list[str] | None = None,
        max_items: int = 50,
    ) -> list[dict]:
        """
        Crawl a URL and extract content items.

        Args:
            url: Target URL to crawl.
            keywords: Optional keyword filter — only return items containing these.
            max_items: Maximum number of items to return.

        Returns:
            List of dictionaries matching post_schema.json shape.
        """
        if not self._check_scrapy():
            return []

        try:
            return self._crawl_with_scrapy(url, keywords, max_items)
        except Exception as e:
            logger.error(f"Scrapy crawl failed for {url}: {e}")
            return []

    def _crawl_with_scrapy(
        self, url: str, keywords: list[str] | None, max_items: int
    ) -> list[dict]:
        """Use Scrapy Selector to parse static HTML."""
        import requests
        from scrapy import Selector

        # Fetch raw HTML (no JS rendering)
        headers = {
            "User-Agent": "NETRA-Crawler/1.0 (+https://netra.gov.in/bot)",
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "en-US,en;q=0.9,hi;q=0.8,gu;q=0.7",
        }

        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()

        sel = Selector(text=response.text)
        parsed = urlparse(url)
        domain = parsed.netloc

        items: list[dict] = []

        # Strategy 1: Look for article/post-like content blocks
        content_selectors = [
            "article",
            ".post", ".entry", ".article", ".story",
            "[role='article']",
            ".tweet", ".status",
            "div.content", "div.body",
        ]

        content_blocks = []
        for css_sel in content_selectors:
            blocks = sel.css(css_sel)
            if blocks:
                content_blocks.extend(blocks)
                break

        # Strategy 2: If no structured content, extract all paragraphs
        if not content_blocks:
            paragraphs = sel.css("p::text").getall()
            for i, para in enumerate(paragraphs[:max_items]):
                text = para.strip()
                if len(text) < 20:
                    continue
                if keywords and not any(kw.lower() in text.lower() for kw in keywords):
                    continue

                post_id = hashlib.sha256(f"{url}:{i}:{text[:50]}".encode()).hexdigest()[:16]
                items.append(self._make_post(post_id, text, url, domain))

            return items[:max_items]

        # Process structured content blocks
        for i, block in enumerate(content_blocks[:max_items]):
            # Extract text from the block
            texts = block.css("::text").getall()
            text = " ".join(t.strip() for t in texts if t.strip())

            if len(text) < 20:
                continue

            if keywords and not any(kw.lower() in text.lower() for kw in keywords):
                continue

            # Extract any links/images
            links = block.css("a::attr(href)").getall()
            images = block.css("img::attr(src)").getall()

            # Extract timestamp if available
            time_el = block.css("time::attr(datetime)").get()

            post_id = hashlib.sha256(
                f"{url}:{i}:{text[:50]}".encode()
            ).hexdigest()[:16]

            post = self._make_post(post_id, text, url, domain)

            if time_el:
                post["created_at"] = time_el

            if images:
                post["media_urls"] = images[:5]

            items.append(post)

        return items[:max_items]

    def _make_post(
        self, post_id: str, text: str, source_url: str, domain: str
    ) -> dict:
        """Create a post dictionary matching post_schema.json."""
        hashtags = _HASHTAG_RE.findall(text)
        mentions = _MENTION_RE.findall(text)

        return {
            "post_id": f"scrapy-{post_id}",
            "platform": "web",
            "author_id": f"web-{domain}",
            "author_handle": domain,
            "text": text[:2000],  # Limit text length
            "language_hint": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "geo_location": None,
            "hashtags": hashtags[:20],
            "mentions": mentions[:20],
            "media_urls": [],
            "engagement_counts": {
                "likes": 0,
                "shares": 0,
                "comments": 0,
            },
            "raw_payload": {
                "source_url": source_url,
                "scraper": "scrapy",
            },
        }

    def test_connectivity(self, url: str) -> bool:
        """
        Quick connectivity test — can Scrapy fetch this URL?

        Returns True if the page returns meaningful HTML content
        (i.e., not a JS-only shell that needs Playwright).
        """
        if not self._check_scrapy():
            return False

        try:
            import requests
            from scrapy import Selector

            response = requests.get(url, timeout=10, headers={
                "User-Agent": "NETRA-Crawler/1.0",
            })
            sel = Selector(text=response.text)

            # Check if page has meaningful text content
            text_content = " ".join(sel.css("body ::text").getall())
            return len(text_content.strip()) > 100

        except Exception:
            return False

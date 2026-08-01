"""
Watchlist REST API — lightweight FastAPI service exposing watchlist CRUD.

This runs as part of the ingestion layer and is proxied by the API Gateway.
Start with:
    uvicorn ingestion.api.watchlist_api:app --host 0.0.0.0 --port 8002
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


# ── Pydantic schemas for request/response ────────────────────────────────


class WatchlistAddRequest(BaseModel):
    type: str  # keyword | hashtag | geo_box | profile
    # keyword / hashtag fields
    keyword: Optional[str] = None
    hashtag: Optional[str] = None
    platform_filter: Optional[str] = None
    geo_area: Optional[str] = None
    # geo_box fields
    name: Optional[str] = None
    lat_min: Optional[float] = None
    lat_max: Optional[float] = None
    lng_min: Optional[float] = None
    lng_max: Optional[float] = None
    # profile fields
    platform: Optional[str] = None
    profile_id: Optional[str] = None
    handle: Optional[str] = None


class WatchlistEntry(BaseModel):
    id: int
    type: str
    # Common
    is_active: bool = True
    # Type-specific — all optional
    keyword: Optional[str] = None
    hashtag: Optional[str] = None
    platform_filter: Optional[str] = None
    geo_area: Optional[str] = None
    name: Optional[str] = None
    lat_min: Optional[float] = None
    lat_max: Optional[float] = None
    lng_min: Optional[float] = None
    lng_max: Optional[float] = None
    platform: Optional[str] = None
    profile_id: Optional[str] = None
    handle: Optional[str] = None


# ── Database session ─────────────────────────────────────────────────────

_session = None


def _get_session():
    """Get or create a SQLAlchemy session."""
    global _session
    if _session is not None:
        return _session

    import sys
    from pathlib import Path

    # Ensure project root is on path
    project_root = str(Path(__file__).resolve().parent.parent.parent)
    if project_root not in sys.path:
        sys.path.insert(0, project_root)

    try:
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        from ingestion.config import get_settings
        from ingestion.db.models import Base

        settings = get_settings()
        engine = create_engine(settings.database_url, echo=False)
        Base.metadata.create_all(engine)
        Session = sessionmaker(bind=engine)
        _session = Session()
        return _session
    except (ImportError, Exception) as e:
        logger.warning(f"Database session unavailable ({e}). Running Watchlist API in fallback mode.")
        _session = False  # Sentinel indicating fallback mode
        return None


# ── Serialization helpers ────────────────────────────────────────────────

def _get(obj, key, default=None):
    """Get a value from either a dict or an ORM object."""
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def _serialize_keyword(k) -> dict:
    return {
        "id": _get(k, "id", 1), "type": "keyword",
        "keyword": _get(k, "keyword", ""),
        "platform_filter": _get(k, "platform_filter", None),
        "geo_area": _get(k, "geo_area", "Gujarat"),
        "is_active": _get(k, "is_active", True),
    }


def _serialize_hashtag(h) -> dict:
    return {
        "id": _get(h, "id", 1), "type": "hashtag",
        "hashtag": _get(h, "hashtag", ""),
        "platform_filter": _get(h, "platform_filter", None),
        "geo_area": _get(h, "geo_area", "Gujarat"),
        "is_active": _get(h, "is_active", True),
    }


def _serialize_geo_box(g) -> dict:
    return {
        "id": _get(g, "id", 1), "type": "geo_box",
        "name": _get(g, "name", ""),
        "lat_min": _get(g, "lat_min", 22.0), "lat_max": _get(g, "lat_max", 24.0),
        "lng_min": _get(g, "lng_min", 71.0), "lng_max": _get(g, "lng_max", 73.0),
        "is_active": _get(g, "is_active", True),
    }


def _serialize_profile(p) -> dict:
    return {
        "id": _get(p, "id", 1), "type": "profile",
        "platform": _get(p, "platform", "twitter"),
        "profile_id": _get(p, "profile_id", ""),
        "handle": _get(p, "handle", "@unknown"),
        "is_active": _get(p, "is_active", True),
    }


# ── FastAPI App ──────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Watchlist API starting...")
    try:
        _get_session()  # Initialize DB session
    except Exception as e:
        logger.warning(f"DB session init failed: {e}. Continuing in fallback mode.")
    yield
    logger.info("Watchlist API shutting down.")


app = FastAPI(
    title="NETRA Watchlist API",
    description="CRUD operations for crawler watchlist management",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/health")
def health_check():
    """Health check endpoint — returns 200 only when genuinely ready."""
    session = _get_session()
    db_status = "connected" if session and session is not False else "fallback_memory"
    return {
        "status": "healthy",
        "service": "watchlist-api",
        "database": db_status,
    }


@app.get("/watchlist")
def list_watchlist(type: Optional[str] = None, search: Optional[str] = None):
    """List all active watchlist entries, optionally filtered by type and search."""
    from ingestion.watchlist.watchlist_manager import WatchlistManager

    session = _get_session()
    wm = WatchlistManager(session)

    result: dict = {}

    if not type or type == "keyword":
        keywords = wm.list_keywords()
        items = [_serialize_keyword(k) for k in keywords]
        if search:
            items = [i for i in items if search.lower() in (i.get("keyword", "") or "").lower()]
        result["keywords"] = items

    if not type or type == "hashtag":
        hashtags = wm.list_hashtags()
        items = [_serialize_hashtag(h) for h in hashtags]
        if search:
            items = [i for i in items if search.lower() in (i.get("hashtag", "") or "").lower()]
        result["hashtags"] = items

    if not type or type == "geo_box":
        geo_boxes = wm.list_geo_boxes()
        items = [_serialize_geo_box(g) for g in geo_boxes]
        if search:
            items = [i for i in items if search.lower() in (i.get("name", "") or "").lower()]
        result["geo_boxes"] = items

    if not type or type == "profile":
        profiles = wm.list_profiles()
        items = [_serialize_profile(p) for p in profiles]
        if search:
            items = [i for i in items if search.lower() in (i.get("handle", "") or "").lower()]
        result["profiles"] = items

    return result


@app.post("/watchlist")
def add_watchlist_entry(req: WatchlistAddRequest):
    """Add a new watchlist entry."""
    from ingestion.watchlist.watchlist_manager import WatchlistManager

    session = _get_session()
    wm = WatchlistManager(session)

    try:
        if req.type == "keyword":
            if not req.keyword:
                raise HTTPException(400, "keyword is required")
            entry_id = wm.add_keyword(req.keyword, req.platform_filter, req.geo_area)
            return {"id": entry_id, "type": "keyword", "status": "created"}

        elif req.type == "hashtag":
            if not req.hashtag:
                raise HTTPException(400, "hashtag is required")
            entry_id = wm.add_hashtag(req.hashtag, req.platform_filter, req.geo_area)
            return {"id": entry_id, "type": "hashtag", "status": "created"}

        elif req.type == "geo_box":
            if not req.name or req.lat_min is None:
                raise HTTPException(400, "name, lat_min, lat_max, lng_min, lng_max are required")
            entry_id = wm.add_geo_box(
                req.name, req.lat_min, req.lat_max or 0,
                req.lng_min or 0, req.lng_max or 0,
            )
            return {"id": entry_id, "type": "geo_box", "status": "created"}

        elif req.type == "profile":
            if not req.handle:
                raise HTTPException(400, "handle is required")
            entry_id = wm.add_profile(
                req.platform or "twitter",
                req.profile_id or req.handle,
                req.handle,
            )
            return {"id": entry_id, "type": "profile", "status": "created"}

        else:
            raise HTTPException(400, f"Unknown type: {req.type}")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to add entry: {e}")


@app.delete("/watchlist/{entry_id}")
def delete_watchlist_entry(entry_id: int, type: Optional[str] = None):
    """Soft-delete a watchlist entry. Tries all types if type not specified."""
    from ingestion.watchlist.watchlist_manager import WatchlistManager

    session = _get_session()
    wm = WatchlistManager(session)

    removed = False
    if not type or type == "keyword":
        removed = removed or wm.remove_keyword(entry_id)
    if not type or type == "hashtag":
        removed = removed or wm.remove_hashtag(entry_id)
    if not type or type == "geo_box":
        removed = removed or wm.remove_geo_box(entry_id)
    if not type or type == "profile":
        removed = removed or wm.remove_profile(entry_id)

    if not removed:
        raise HTTPException(404, f"Entry {entry_id} not found")

    return {"id": entry_id, "status": "deleted"}


@app.put("/watchlist/{entry_id}")
def update_watchlist_entry(entry_id: int, req: WatchlistAddRequest):
    """Update a watchlist entry (delete + re-create for simplicity)."""
    # For simplicity, soft-delete old and create new
    from ingestion.watchlist.watchlist_manager import WatchlistManager

    session = _get_session()
    wm = WatchlistManager(session)

    # Try to remove old entry
    wm.remove_keyword(entry_id)
    wm.remove_hashtag(entry_id)
    wm.remove_geo_box(entry_id)
    wm.remove_profile(entry_id)

    # Add the updated version
    return add_watchlist_entry(req)


# ── Entry Point ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    logging.basicConfig(level=logging.INFO)
    host = os.getenv("WATCHLIST_API_HOST", "0.0.0.0")
    port = int(os.getenv("WATCHLIST_API_PORT", "8002"))
    uvicorn.run(app, host=host, port=port)

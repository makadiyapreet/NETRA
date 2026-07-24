"""
SQLAlchemy engine and session factory.

Reads ``DATABASE_URL`` from the application config.  For unit tests the URL
can be overridden to ``sqlite:///:memory:``.
"""

from __future__ import annotations

from typing import Optional

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from ingestion.config import Settings, get_settings

_engine: Optional[Engine] = None
_SessionLocal: Optional[sessionmaker] = None  # type: ignore[type-arg]


def get_engine(settings: Optional[Settings] = None) -> Engine:
    """Return (or create) the global SQLAlchemy engine."""
    global _engine
    if _engine is None:
        s = settings or get_settings()
        _engine = create_engine(
            s.database_url,
            pool_pre_ping=True,
            pool_size=5,
            max_overflow=10,
            echo=False,
        )
    return _engine


def get_session_factory(settings: Optional[Settings] = None) -> sessionmaker:  # type: ignore[type-arg]
    """Return a ``sessionmaker`` bound to the global engine."""
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(
            bind=get_engine(settings),
            autocommit=False,
            autoflush=False,
        )
    return _SessionLocal


def get_session(settings: Optional[Settings] = None) -> Session:
    """Convenience: return a new ``Session`` instance."""
    factory = get_session_factory(settings)
    return factory()


def reset_engine() -> None:
    """Reset global engine + session factory (useful in tests)."""
    global _engine, _SessionLocal
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _SessionLocal = None

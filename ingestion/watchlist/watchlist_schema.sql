-- ============================================================
-- NETRA — Watchlist Schema (PostgreSQL DDL)
-- ============================================================
-- This migration creates the watchlist tables used by the
-- ingestion layer to track keywords, hashtags, geo-bounding-boxes,
-- and social-media profiles for monitoring.
-- ============================================================

-- Tracked keywords
CREATE TABLE IF NOT EXISTS watchlist_keywords (
    id              SERIAL PRIMARY KEY,
    keyword         VARCHAR(255) NOT NULL,
    platform_filter VARCHAR(50),         -- NULL = all platforms
    geo_area        VARCHAR(255),        -- e.g. "Gujarat", "Mumbai"
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tracked hashtags
CREATE TABLE IF NOT EXISTS watchlist_hashtags (
    id              SERIAL PRIMARY KEY,
    hashtag         VARCHAR(255) NOT NULL,
    platform_filter VARCHAR(50),
    geo_area        VARCHAR(255),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Geo-bounding-boxes for location-based monitoring
CREATE TABLE IF NOT EXISTS watchlist_geo_boxes (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    lat_min         DOUBLE PRECISION NOT NULL,
    lat_max         DOUBLE PRECISION NOT NULL,
    lng_min         DOUBLE PRECISION NOT NULL,
    lng_max         DOUBLE PRECISION NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tracked social-media profiles
CREATE TABLE IF NOT EXISTS watchlist_profiles (
    id              SERIAL PRIMARY KEY,
    platform        VARCHAR(50)  NOT NULL,   -- twitter, instagram, facebook, youtube
    profile_id      VARCHAR(255) NOT NULL,   -- platform-specific ID
    handle          VARCHAR(255) NOT NULL,   -- display handle
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (platform, profile_id)
);

-- Crawl job logging
CREATE TABLE IF NOT EXISTS crawl_jobs (
    id              SERIAL PRIMARY KEY,
    platform        VARCHAR(50) NOT NULL,
    connector_type  VARCHAR(50) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'running',
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at     TIMESTAMPTZ,
    posts_fetched   INTEGER NOT NULL DEFAULT 0,
    posts_published INTEGER NOT NULL DEFAULT 0,
    posts_deduped   INTEGER NOT NULL DEFAULT 0,
    errors          INTEGER NOT NULL DEFAULT 0,
    error_detail    TEXT
);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_keywords_active
    ON watchlist_keywords (is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_hashtags_active
    ON watchlist_hashtags (is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_profiles_active
    ON watchlist_profiles (is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_status
    ON crawl_jobs (status, started_at DESC);

-- ── Seed Data ──────────────────────────────────────────────────────────────
-- Sample watchlist entries for demo/testing

INSERT INTO watchlist_keywords (keyword, geo_area) VALUES
    ('communal tension', 'Gujarat'),
    ('riot', 'Gujarat'),
    ('danga', 'Gujarat'),                -- Hindi: riot
    ('fake news', NULL),
    ('misinformation', NULL),
    ('threat to life', NULL),
    ('भड़काऊ', NULL),                      -- Hindi: inflammatory
    ('હિંસા', NULL)                       -- Gujarati: violence
ON CONFLICT DO NOTHING;

INSERT INTO watchlist_hashtags (hashtag, geo_area) VALUES
    ('#CommunalTension', 'Gujarat'),
    ('#FakeNews', NULL),
    ('#Riot', 'Gujarat'),
    ('#दंगा', 'Gujarat'),                 -- Hindi: riot
    ('#ગુજરાત', 'Gujarat')              -- Gujarati: Gujarat
ON CONFLICT DO NOTHING;

INSERT INTO watchlist_geo_boxes (name, lat_min, lat_max, lng_min, lng_max) VALUES
    ('Gujarat',    20.0, 24.7, 68.1, 74.5),
    ('Mumbai',     18.8, 19.3, 72.7, 73.0),
    ('Ahmedabad',  22.9, 23.1, 72.4, 72.7)
ON CONFLICT DO NOTHING;

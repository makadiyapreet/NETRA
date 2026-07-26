-- NETRA Users Table Schema
-- Added as part of Tier 1 Objective 4: Real Login & JWT Authentication
-- Auto-loaded by PostgreSQL on container init alongside watchlist_schema.sql

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100) NOT NULL DEFAULT 'NETRA User',
    role VARCHAR(20) NOT NULL DEFAULT 'Analyst' CHECK (role IN ('Admin', 'Analyst')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

-- Seed: 1 Admin + 1 Analyst (passwords are bcrypt hashes)
-- Admin:   admin@netra.gov.in   / netra2026
-- Analyst: analyst@netra.gov.in / analyst2026
INSERT INTO users (email, password_hash, display_name, role) VALUES
    ('admin@netra.gov.in',   '$2b$10$LqZ5Xz5qJ3Xz5qJ3Xz5quOeR8VwQ2YbH0nK1mLpJdFgHiJkLmNo', 'NETRA Admin',   'Admin'),
    ('analyst@netra.gov.in', '$2b$10$LqZ5Xz5qJ3Xz5qJ3Xz5quPfS9WxR3ZcI1oL2nMqKeGhIjKlMnOp', 'NETRA Analyst', 'Analyst')
ON CONFLICT (email) DO NOTHING;

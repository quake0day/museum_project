-- 0008_users.sql
-- Adds an explicit users table so accounts can hold optional email + PIN.
-- Existing tenants (rows in interactions, wiki_pages, etc.) keep working
-- because user_id continues to be the unscoped slug; the users table just
-- becomes a place to attach security material.

CREATE TABLE IF NOT EXISTS users (
  user_id              TEXT PRIMARY KEY,
  email                TEXT,                -- NULL until user binds an email
  email_verified_at    TEXT,                -- ISO8601, NULL until they click the link
  pending_email        TEXT,                -- email being verified but not yet active
  pending_pin_hash     TEXT,                -- PIN hash staged with pending_email
  pending_token_hash   TEXT,                -- SHA-256 of the verification token (we never store the raw token)
  pending_expires_at   TEXT,                -- ISO8601, verification token TTL
  pin_hash             TEXT,                -- active PIN (PBKDF2-SHA256, base64url)
  pin_salt             TEXT,                -- base64url salt
  pin_iterations       INTEGER,             -- PBKDF2 iterations (currently 100000)
  pin_set_at           TEXT,                -- ISO8601, when active PIN was last changed
  failed_attempts      INTEGER NOT NULL DEFAULT 0,
  locked_until         TEXT,                -- ISO8601 lockout until this moment
  recovery_token_hash  TEXT,                -- SHA-256 of recovery token
  recovery_expires_at  TEXT,                -- ISO8601
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Email lookups (forgot-password, uniqueness check).
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email
  ON users(email)
  WHERE email IS NOT NULL;

-- Backfill: every distinct user_id we have data for gets a stub row so
-- /me/security can render without a missing-row branch.
INSERT OR IGNORE INTO users (user_id)
SELECT DISTINCT user_id FROM interactions
UNION
SELECT DISTINCT user_id FROM wiki_pages;

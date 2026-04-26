-- v0.5 — wiki layer + analysis columns
--
-- Adds the LLM-maintained wiki (markdown pages in D1), a derived link/log
-- index, and the analysis bookkeeping columns on the existing interactions
-- table. Forward-only, idempotent.

-- ── analysis bookkeeping on interactions ─────────────────────────────
-- D1 ignores duplicate-column ALTERs gracefully via the "IF NOT EXISTS"
-- pattern most engines support. SQLite does NOT support
-- ALTER TABLE … ADD COLUMN IF NOT EXISTS — so each migration must run
-- exactly once. Re-running this file on an already-migrated DB will fail
-- on the ALTERs; that is by design.

ALTER TABLE interactions ADD COLUMN analysis_status   TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE interactions ADD COLUMN analysis_version  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE interactions ADD COLUMN analysis_provider TEXT;
ALTER TABLE interactions ADD COLUMN analyzed_at       TEXT;
ALTER TABLE interactions ADD COLUMN analysis_error    TEXT;
ALTER TABLE interactions ADD COLUMN primary_domain    TEXT;
ALTER TABLE interactions ADD COLUMN object_type       TEXT;
ALTER TABLE interactions ADD COLUMN approx_year       INTEGER;
ALTER TABLE interactions ADD COLUMN origin_lat        REAL;
ALTER TABLE interactions ADD COLUMN origin_lon        REAL;
ALTER TABLE interactions ADD COLUMN child_summary     TEXT;
ALTER TABLE interactions ADD COLUMN user_id           TEXT NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS idx_int_status  ON interactions(analysis_status);
CREATE INDEX IF NOT EXISTS idx_int_domain  ON interactions(primary_domain);
CREATE INDEX IF NOT EXISTS idx_int_year    ON interactions(approx_year);
CREATE INDEX IF NOT EXISTS idx_int_user    ON interactions(user_id);

-- ── wiki pages (the durable knowledge artifact, source of truth) ────
CREATE TABLE IF NOT EXISTS wiki_pages (
  user_id          TEXT NOT NULL,
  path             TEXT NOT NULL,
  kind             TEXT NOT NULL,
  title            TEXT NOT NULL,
  body             TEXT NOT NULL,
  frontmatter_json TEXT,
  body_hash        TEXT NOT NULL,
  source_count     INTEGER NOT NULL DEFAULT 0,
  inbound_links    INTEGER NOT NULL DEFAULT 0,
  outbound_links   INTEGER NOT NULL DEFAULT 0,
  last_ingest_at   TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  PRIMARY KEY (user_id, path)
);
CREATE INDEX IF NOT EXISTS idx_wiki_user_kind ON wiki_pages(user_id, kind);
CREATE INDEX IF NOT EXISTS idx_wiki_updated   ON wiki_pages(updated_at DESC);

-- ── wiki internal-link index (rebuilt by indexer on each write) ─────
CREATE TABLE IF NOT EXISTS wiki_links (
  user_id   TEXT NOT NULL,
  src_path  TEXT NOT NULL,
  dst_path  TEXT NOT NULL,
  relation  TEXT,
  PRIMARY KEY (user_id, src_path, dst_path, relation)
);
CREATE INDEX IF NOT EXISTS idx_wiki_links_dst ON wiki_links(user_id, dst_path);

-- ── append-only audit trail (mirror of log.md) ──────────────────────
CREATE TABLE IF NOT EXISTS wiki_log (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   TEXT NOT NULL,
  ts        TEXT NOT NULL,
  kind      TEXT NOT NULL,
  ref_path  TEXT,
  message   TEXT NOT NULL,
  meta_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_wiki_log_user_ts ON wiki_log(user_id, ts DESC);

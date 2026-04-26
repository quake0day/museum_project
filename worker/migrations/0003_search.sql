-- v0.7 — full-text search index over wiki pages.
-- Backed by SQLite FTS5; stays in sync via triggers on wiki_pages.

CREATE VIRTUAL TABLE IF NOT EXISTS wiki_pages_fts USING fts5(
  title,
  body,
  user_id UNINDEXED,
  path UNINDEXED,
  kind UNINDEXED,
  content='wiki_pages',
  content_rowid='rowid',
  tokenize = 'porter unicode61'
);

-- Backfill from existing rows (no-op on empty).
INSERT INTO wiki_pages_fts (rowid, title, body, user_id, path, kind)
SELECT rowid, title, body, user_id, path, kind FROM wiki_pages
WHERE NOT EXISTS (
  SELECT 1 FROM wiki_pages_fts f WHERE f.rowid = wiki_pages.rowid
);

-- Sync triggers
CREATE TRIGGER IF NOT EXISTS wiki_pages_ai AFTER INSERT ON wiki_pages BEGIN
  INSERT INTO wiki_pages_fts (rowid, title, body, user_id, path, kind)
  VALUES (new.rowid, new.title, new.body, new.user_id, new.path, new.kind);
END;

CREATE TRIGGER IF NOT EXISTS wiki_pages_ad AFTER DELETE ON wiki_pages BEGIN
  INSERT INTO wiki_pages_fts (wiki_pages_fts, rowid, title, body, user_id, path, kind)
  VALUES ('delete', old.rowid, old.title, old.body, old.user_id, old.path, old.kind);
END;

CREATE TRIGGER IF NOT EXISTS wiki_pages_au AFTER UPDATE ON wiki_pages BEGIN
  INSERT INTO wiki_pages_fts (wiki_pages_fts, rowid, title, body, user_id, path, kind)
  VALUES ('delete', old.rowid, old.title, old.body, old.user_id, old.path, old.kind);
  INSERT INTO wiki_pages_fts (rowid, title, body, user_id, path, kind)
  VALUES (new.rowid, new.title, new.body, new.user_id, new.path, new.kind);
END;

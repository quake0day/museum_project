-- MuseIQ D1 schema
CREATE TABLE IF NOT EXISTS interactions (
  id        TEXT PRIMARY KEY,
  response  TEXT NOT NULL DEFAULT '',
  image     TEXT NOT NULL,
  date      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_interactions_date ON interactions(date DESC);

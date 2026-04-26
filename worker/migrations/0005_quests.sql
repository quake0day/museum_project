-- v0.9 — quest progress + earned badges, per user.
-- Quest definitions themselves live in worker/src/wiki/quests.ts (in-code,
-- typed, version-controlled). Only state-per-user lives in D1.

CREATE TABLE IF NOT EXISTS quest_status (
  user_id    TEXT NOT NULL,
  quest_id   TEXT NOT NULL,
  earned_at  TEXT NOT NULL,
  PRIMARY KEY (user_id, quest_id)
);
CREATE INDEX IF NOT EXISTS idx_quest_user ON quest_status(user_id);

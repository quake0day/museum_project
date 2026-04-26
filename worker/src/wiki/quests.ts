// Quest catalog + progress engine.
//
// Each quest is a pure function over (db, userId) that returns
// { current, target, hint }. Done when current >= target.
// Definitions live in this file (versioned with code); only earned-state
// per user lives in D1 (quest_status table).

import { appendWikiLog } from "./db";

export type QuestDef = {
  id: string;
  title: string;
  description: string;
  emoji: string;
  evaluate(db: D1Database, userId: string): Promise<{ current: number; target: number; hint?: string }>;
};

export type QuestProgress = QuestDef & {
  current: number;
  target: number;
  hint?: string;
  completed: boolean;
  earnedAt?: string;
};

// ─── helpers ────────────────────────────────────────────────────────

async function countExhibitsLinkingTo(
  db: D1Database,
  userId: string,
  dstPath: string,
): Promise<number> {
  const r = await db
    .prepare(
      `SELECT COUNT(DISTINCT wl.src_path) AS n
         FROM wiki_links wl
         JOIN wiki_pages wp
           ON wp.user_id = wl.user_id AND wp.path = wl.src_path
        WHERE wl.user_id = ?1 AND wl.dst_path = ?2 AND wp.kind = 'exhibit'`,
    )
    .bind(userId, dstPath)
    .first<{ n: number }>();
  return r?.n ?? 0;
}

async function countDistinctTargetsByKind(
  db: D1Database,
  userId: string,
  kind: string,
): Promise<number> {
  const r = await db
    .prepare(
      `SELECT COUNT(DISTINCT wl.dst_path) AS n
         FROM wiki_links wl
         JOIN wiki_pages dst
           ON dst.user_id = wl.user_id AND dst.path = wl.dst_path
        WHERE wl.user_id = ?1 AND dst.kind = ?2`,
    )
    .bind(userId, kind)
    .first<{ n: number }>();
  return r?.n ?? 0;
}

async function countExhibitsWithDomain(
  db: D1Database,
  userId: string,
  domain: string,
): Promise<number> {
  const r = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM interactions
        WHERE user_id = ?1 AND analysis_status = 'done' AND primary_domain = ?2`,
    )
    .bind(userId, domain)
    .first<{ n: number }>();
  return r?.n ?? 0;
}

async function countExhibitsWithYearIn(
  db: D1Database,
  userId: string,
  yMin: number,
  yMax: number,
): Promise<number> {
  const r = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM interactions
        WHERE user_id = ?1 AND analysis_status = 'done'
          AND approx_year IS NOT NULL AND approx_year >= ?2 AND approx_year <= ?3`,
    )
    .bind(userId, yMin, yMax)
    .first<{ n: number }>();
  return r?.n ?? 0;
}

async function countTotalDoneExhibits(
  db: D1Database,
  userId: string,
): Promise<number> {
  const r = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM interactions WHERE user_id = ?1 AND analysis_status = 'done'`,
    )
    .bind(userId)
    .first<{ n: number }>();
  return r?.n ?? 0;
}

// ─── quest catalog ──────────────────────────────────────────────────

export const QUESTS: QuestDef[] = [
  {
    id: "first-capture",
    title: "First Capture",
    emoji: "🎉",
    description: "Capture your first exhibit and let the AI write its wiki page.",
    async evaluate(db, userId) {
      const n = await countTotalDoneExhibits(db, userId);
      return { current: Math.min(n, 1), target: 1 };
    },
  },
  {
    id: "junior-curator",
    title: "Junior Curator",
    emoji: "🏛️",
    description: "Capture 10 exhibits across any domain.",
    async evaluate(db, userId) {
      return { current: await countTotalDoneExhibits(db, userId), target: 10 };
    },
  },
  {
    id: "bronze-hunter",
    title: "Bronze Hunter",
    emoji: "🛡️",
    description: "Find 3 exhibits made of bronze.",
    async evaluate(db, userId) {
      return { current: await countExhibitsLinkingTo(db, userId, "materials/bronze"), target: 3 };
    },
  },
  {
    id: "color-detective",
    title: "Color Detective",
    emoji: "🎨",
    description: "Capture 5 art exhibits and look closely at their colors.",
    async evaluate(db, userId) {
      return { current: await countExhibitsWithDomain(db, userId, "art"), target: 5 };
    },
  },
  {
    id: "time-traveler",
    title: "Time Traveler",
    emoji: "⏳",
    description: "Capture exhibits from 3 different time periods.",
    async evaluate(db, userId) {
      return {
        current: await countDistinctTargetsByKind(db, userId, "period"),
        target: 3,
      };
    },
  },
  {
    id: "ancient-civilizations",
    title: "Ancient Civilizations Explorer",
    emoji: "🗿",
    description: "Visit 3 ancient civilizations through their artifacts (anything before 500 CE).",
    async evaluate(db, userId) {
      return {
        current: await countExhibitsWithYearIn(db, userId, -200000, 500),
        target: 3,
        hint: "Tip: ancient Egypt, Greece, Rome, China, India, the Maya…",
      };
    },
  },
  {
    id: "around-the-world",
    title: "Around the World",
    emoji: "🌍",
    description: "Capture exhibits from 5 different places.",
    async evaluate(db, userId) {
      return {
        current: await countDistinctTargetsByKind(db, userId, "place"),
        target: 5,
      };
    },
  },
  {
    id: "fossil-finder",
    title: "Fossil Finder",
    emoji: "🦖",
    description: "Capture 3 natural-science exhibits (fossils, dinosaurs, minerals…).",
    async evaluate(db, userId) {
      return { current: await countExhibitsWithDomain(db, userId, "science"), target: 3 };
    },
  },
  {
    id: "inventor",
    title: "Inventor's Apprentice",
    emoji: "⚙️",
    description: "Capture 3 technology or invention exhibits.",
    async evaluate(db, userId) {
      const a = await countExhibitsWithDomain(db, userId, "tech");
      const b = await countExhibitsWithDomain(db, userId, "technology");
      return { current: a + b, target: 3 };
    },
  },
  {
    id: "world-traditions",
    title: "World Traditions",
    emoji: "🪔",
    description: "Capture 3 culture exhibits — clothing, food, festivals, music.",
    async evaluate(db, userId) {
      return { current: await countExhibitsWithDomain(db, userId, "culture"), target: 3 };
    },
  },
  {
    id: "concept-collector",
    title: "Concept Collector",
    emoji: "📚",
    description: "Have 10 different concept pages in your wiki.",
    async evaluate(db, userId) {
      return {
        current: await countDistinctTargetsByKind(db, userId, "concept"),
        target: 10,
      };
    },
  },
];

// ─── engine ─────────────────────────────────────────────────────────

export async function evaluateQuests(
  db: D1Database,
  userId: string,
): Promise<QuestProgress[]> {
  const earned = await db
    .prepare("SELECT quest_id, earned_at FROM quest_status WHERE user_id = ?1")
    .bind(userId)
    .all<{ quest_id: string; earned_at: string }>();
  const earnedMap = new Map<string, string>();
  for (const r of earned.results ?? []) earnedMap.set(r.quest_id, r.earned_at);

  const out: QuestProgress[] = [];
  for (const q of QUESTS) {
    let progress: { current: number; target: number; hint?: string };
    try {
      progress = await q.evaluate(db, userId);
    } catch (e) {
      console.error("quest eval failed", q.id, e);
      progress = { current: 0, target: 1 };
    }
    const completed = progress.current >= progress.target;
    out.push({
      ...q,
      ...progress,
      completed,
      earnedAt: earnedMap.get(q.id),
    });
  }
  return out;
}

// Called by ingest after each successful exhibit save. Detects newly-completed
// quests, writes a quest_status row, and appends a log entry per badge.
export async function checkAndAwardQuests(
  db: D1Database,
  userId: string,
): Promise<string[]> {
  const all = await evaluateQuests(db, userId);
  const newlyEarned: string[] = [];
  const now = new Date().toISOString();
  for (const q of all) {
    if (!q.completed || q.earnedAt) continue;
    try {
      await db
        .prepare(
          "INSERT OR IGNORE INTO quest_status (user_id, quest_id, earned_at) VALUES (?1, ?2, ?3)",
        )
        .bind(userId, q.id, now)
        .run();
      await appendWikiLog(db, userId, "badge", null, `🏅 Earned badge: ${q.emoji} ${q.title}`, { quest_id: q.id });
      newlyEarned.push(q.id);
    } catch (e) {
      console.error("award failed", q.id, e);
    }
  }
  return newlyEarned;
}

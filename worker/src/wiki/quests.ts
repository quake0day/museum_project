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
  title_zh: string;        // Simplified Chinese
  description: string;
  description_zh: string;
  emoji: string;
  evaluate(db: D1Database, userId: string): Promise<{ current: number; target: number; hint?: string; hint_zh?: string }>;
};

export type QuestProgress = QuestDef & {
  current: number;
  target: number;
  hint?: string;
  hint_zh?: string;
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
    title_zh: "首次拍摄",
    emoji: "🎉",
    description: "Capture your first exhibit and let the AI write its wiki page.",
    description_zh: "拍下你的第一件展品,让 AI 帮你写成百科页面。",
    async evaluate(db, userId) {
      const n = await countTotalDoneExhibits(db, userId);
      return { current: Math.min(n, 1), target: 1 };
    },
  },
  {
    id: "junior-curator",
    title: "Junior Curator",
    title_zh: "小小策展人",
    emoji: "🏛️",
    description: "Capture 10 exhibits across any domain.",
    description_zh: "在任何领域拍下 10 件展品。",
    async evaluate(db, userId) {
      return { current: await countTotalDoneExhibits(db, userId), target: 10 };
    },
  },
  {
    id: "bronze-hunter",
    title: "Bronze Hunter",
    title_zh: "青铜猎手",
    emoji: "🛡️",
    description: "Find 3 exhibits made of bronze.",
    description_zh: "找到 3 件由青铜制成的展品。",
    async evaluate(db, userId) {
      return { current: await countExhibitsLinkingTo(db, userId, "materials/bronze"), target: 3 };
    },
  },
  {
    id: "color-detective",
    title: "Color Detective",
    title_zh: "色彩侦探",
    emoji: "🎨",
    description: "Capture 5 art exhibits and look closely at their colors.",
    description_zh: "拍下 5 件艺术展品,仔细观察它们的颜色。",
    async evaluate(db, userId) {
      return { current: await countExhibitsWithDomain(db, userId, "art"), target: 5 };
    },
  },
  {
    id: "time-traveler",
    title: "Time Traveler",
    title_zh: "时空旅行者",
    emoji: "⏳",
    description: "Capture exhibits from 3 different time periods.",
    description_zh: "拍下 3 个不同时代的展品。",
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
    title_zh: "古文明探索者",
    emoji: "🗿",
    description: "Visit 3 ancient civilizations through their artifacts (anything before 500 CE).",
    description_zh: "通过文物探访 3 个古代文明(公元 500 年之前)。",
    async evaluate(db, userId) {
      return {
        current: await countExhibitsWithYearIn(db, userId, -200000, 500),
        target: 3,
        hint: "Tip: ancient Egypt, Greece, Rome, China, India, the Maya…",
        hint_zh: "提示:古埃及、希腊、罗马、中国、印度、玛雅……",
      };
    },
  },
  {
    id: "around-the-world",
    title: "Around the World",
    title_zh: "环游世界",
    emoji: "🌍",
    description: "Capture exhibits from 5 different places.",
    description_zh: "拍下来自 5 个不同地点的展品。",
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
    title_zh: "化石发现者",
    emoji: "🦖",
    description: "Capture 3 natural-science exhibits (fossils, dinosaurs, minerals…).",
    description_zh: "拍下 3 件自然科学展品(化石、恐龙、矿物……)。",
    async evaluate(db, userId) {
      return { current: await countExhibitsWithDomain(db, userId, "science"), target: 3 };
    },
  },
  {
    id: "inventor",
    title: "Inventor's Apprentice",
    title_zh: "发明家学徒",
    emoji: "⚙️",
    description: "Capture 3 technology or invention exhibits.",
    description_zh: "拍下 3 件科技或发明展品。",
    async evaluate(db, userId) {
      const a = await countExhibitsWithDomain(db, userId, "tech");
      const b = await countExhibitsWithDomain(db, userId, "technology");
      return { current: a + b, target: 3 };
    },
  },
  {
    id: "world-traditions",
    title: "World Traditions",
    title_zh: "世界传统",
    emoji: "🪔",
    description: "Capture 3 culture exhibits — clothing, food, festivals, music.",
    description_zh: "拍下 3 件文化展品 — 服饰、食物、节日、音乐。",
    async evaluate(db, userId) {
      return { current: await countExhibitsWithDomain(db, userId, "culture"), target: 3 };
    },
  },
  {
    id: "concept-collector",
    title: "Concept Collector",
    title_zh: "概念收集者",
    emoji: "📚",
    description: "Have 10 different concept pages in your wiki.",
    description_zh: "在你的百科里收集 10 个不同的概念页面。",
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

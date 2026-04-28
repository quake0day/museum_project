// Data assembly for the student home dashboard at /.
// Pure read-only — runs on every / request, but cheap (small queries).

import { evaluateQuests } from "./quests";
import type { QuestProgress } from "./quests";
import { listWikiPages, recentWikiLog } from "./db";
import type { WikiPageRow, WikiLogRow } from "./db";

export type RecentExhibit = {
  id: string;
  title: string;
  title_zh: string | null;          // pulled from wiki_pages frontmatter
  image: string;                    // R2 key
  primary_domain: string | null;
  child_summary: string | null;     // legacy column on interactions
  child_summary_zh: string | null;  // pulled from wiki_pages frontmatter (summary_8_10_zh)
  date: string;
};

export type DashboardData = {
  totals: {
    exhibits: number;
    pending: number;
    concepts: number;
    places: number;
    periods: number;
  };
  recent: RecentExhibit[];
  inProgress: QuestProgress[];     // non-completed, current > 0
  earnedRecent: QuestProgress[];   // earned, sorted by date desc
  nextAdventure: NextAdventure;
  log: WikiLogRow[];
};

export type NextAdventure = {
  kind: "quest" | "concept" | "domain" | "first";
  emoji: string;
  title_en: string;
  title_zh: string;
  hint_en: string;
  hint_zh: string;
  href: string;
};

export async function buildDashboard(
  db: D1Database,
  userId: string,
): Promise<DashboardData> {
  const [exTotalsRow, recentRows, byKind, allQuests, log] = await Promise.all([
    db
      .prepare(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN analysis_status='done' THEN 1 ELSE 0 END) AS done,
           SUM(CASE WHEN analysis_status IN ('pending','running','failed') THEN 1 ELSE 0 END) AS pending
         FROM interactions WHERE user_id = ?1`,
      )
      .bind(userId)
      .first<{ total: number; done: number; pending: number }>(),
    db
      .prepare(
        `SELECT i.id, i.image, i.primary_domain, i.child_summary, i.date,
                COALESCE(wp.title, 'Exhibit') AS title,
                wp.frontmatter_json AS frontmatter_json
           FROM interactions i
           LEFT JOIN wiki_pages wp
             ON wp.user_id = i.user_id AND wp.path = 'exhibits/' || i.id
          WHERE i.user_id = ?1 AND i.analysis_status = 'done'
          ORDER BY i.date DESC LIMIT 6`,
      )
      .bind(userId)
      .all<RecentExhibit & { frontmatter_json: string | null }>(),
    db
      .prepare(
        `SELECT kind, COUNT(*) AS n FROM wiki_pages WHERE user_id = ?1 AND kind IN ('concept','place','period') GROUP BY kind`,
      )
      .bind(userId)
      .all<{ kind: string; n: number }>(),
    evaluateQuests(db, userId),
    recentWikiLog(db, userId, 30),
  ]);

  const kindCounts: Record<string, number> = {};
  for (const r of byKind.results ?? []) kindCounts[r.kind] = r.n;

  const inProgress = allQuests
    .filter((q) => !q.earnedAt && q.current > 0)
    .sort((a, b) => (b.current / b.target) - (a.current / a.target))
    .slice(0, 3);

  const earnedRecent = allQuests
    .filter((q) => q.earnedAt)
    .sort((a, b) => (b.earnedAt || "").localeCompare(a.earnedAt || ""))
    .slice(0, 4);

  const totals = {
    exhibits: exTotalsRow?.done ?? 0,
    pending: exTotalsRow?.pending ?? 0,
    concepts: kindCounts.concept ?? 0,
    places: kindCounts.place ?? 0,
    periods: kindCounts.period ?? 0,
  };

  const nextAdventure = await pickNextAdventure(db, userId, allQuests, totals);

  // Enrich recent rows with bilingual fields from frontmatter so the
  // dashboard cards can swap title/summary with the active <html lang>.
  const recent = (recentRows.results ?? []).map((r) => {
    let titleZh: string | null = null;
    let summaryZh: string | null = null;
    const frontmatter = (r as RecentExhibit & { frontmatter_json: string | null }).frontmatter_json;
    try {
      if (frontmatter) {
        const fm = JSON.parse(frontmatter);
        if (typeof fm.title_zh === "string" && fm.title_zh.trim()) titleZh = fm.title_zh.trim();
        // Prefer the medium-age summary_8_10_zh as the card preview;
        // fall back to summary_5_7_zh / summary_11_13_zh if 8_10 is missing.
        const zhKeys = ["summary_8_10_zh", "summary_5_7_zh", "summary_11_13_zh"];
        for (const k of zhKeys) {
          if (typeof fm[k] === "string" && fm[k].trim()) { summaryZh = fm[k].trim(); break; }
        }
      }
    } catch { /* ignore */ }
    return {
      id: r.id, title: r.title,
      title_zh: titleZh,
      image: r.image,
      primary_domain: r.primary_domain,
      child_summary: r.child_summary,
      child_summary_zh: summaryZh,
      date: r.date,
    };
  });

  return {
    totals,
    recent,
    inProgress,
    earnedRecent,
    nextAdventure,
    log,
  };
}

// Localized strings for each NextAdventure variant. The dashboard returns
// both EN and ZH variants so the layer-cake of UI can paint paired spans
// for the user's active language without needing extra LLM work.
const ADV_FIRST = {
  title_en: "Capture your first exhibit",
  title_zh: "拍下你的第一件展品",
  hint_en: "Open the MuseIQ app at the museum, take a photo of anything you find interesting, and write a quick reflection. The AI will turn it into your first wiki page.",
  hint_zh: "在博物馆打开 MuseIQ 应用,拍下你感兴趣的展品,写下你的想法。AI 会把它变成你的第一个百科页面。",
};
const ADV_EXPLORE_NEW = {
  title_en: "Explore something new",
  title_zh: "探索新的领域",
};
const ADV_DOMAIN_HINTS: Record<string, { emoji: string; en: string; zh: string }> = {
  history:  { emoji: "🏺", en: "Try a history exhibit — an artifact from a past civilization.",   zh: "试试一件历史展品 — 来自过去文明的文物。" },
  art:      { emoji: "🎨", en: "Try an art exhibit — a painting, sculpture, or photograph.",     zh: "试试一件艺术展品 — 绘画、雕塑或摄影。" },
  science:  { emoji: "🦖", en: "Try a natural science exhibit — fossils, animals, or minerals.", zh: "试试一件自然科学展品 — 化石、动物或矿物。" },
  tech:     { emoji: "⚙️", en: "Try a technology exhibit — machines, instruments, or inventions.", zh: "试试一件科技展品 — 机器、仪器或发明。" },
  culture:  { emoji: "🌍", en: "Try a culture exhibit — clothing, music, festivals, or food.",   zh: "试试一件文化展品 — 服饰、音乐、节日或食物。" },
};
const ALMOST_PREFIX = { en: "Almost there:", zh: "差一点就完成了:" };
const DIVE_DEEPER_PREFIX = { en: "Dive deeper into", zh: "深入了解" };
const YOU_CAPTURED = { en: "You've captured", zh: "你已经拍下了" };
const HUB_HINT_SUFFIX = {
  en: "exhibits that touch this concept — its page is one of the busiest hubs in your wiki.",
  zh: "件展品涉及这个概念 — 它的页面是你百科里连接最多的中心之一。",
};

async function pickNextAdventure(
  db: D1Database,
  userId: string,
  quests: QuestProgress[],
  totals: { exhibits: number; pending: number; concepts: number },
): Promise<NextAdventure> {
  // 0 exhibits → onboarding nudge
  if (totals.exhibits === 0) {
    return {
      kind: "first",
      emoji: "📸",
      title_en: ADV_FIRST.title_en,
      title_zh: ADV_FIRST.title_zh,
      hint_en: ADV_FIRST.hint_en,
      hint_zh: ADV_FIRST.hint_zh,
      href: "/interactions/view",
    };
  }
  // closest-to-done active quest
  const close = quests
    .filter((q) => !q.earnedAt && q.current > 0)
    .sort((a, b) => (b.current / b.target) - (a.current / a.target))[0];
  if (close && close.current / close.target >= 0.5) {
    return {
      kind: "quest",
      emoji: close.emoji,
      title_en: `${ALMOST_PREFIX.en} ${close.title}`,
      title_zh: `${ALMOST_PREFIX.zh} ${close.title_zh ?? close.title}`,
      hint_en: `${close.current} of ${close.target} — ${close.description}`,
      hint_zh: `${close.current} / ${close.target} — ${close.description_zh ?? close.description}`,
      href: "/me/quests",
    };
  }
  // pick a hub concept page (one with the most inbound links) to suggest
  // — pull title_zh from frontmatter if present so the prompt actually
  // reads in 中文 mode.
  const hubs = await db
    .prepare(
      `SELECT path, title, kind, inbound_links, frontmatter_json
         FROM wiki_pages
        WHERE user_id = ?1 AND kind = 'concept' AND inbound_links >= 2
        ORDER BY inbound_links DESC LIMIT 1`,
    )
    .bind(userId)
    .first<{ path: string; title: string; kind: string; inbound_links: number; frontmatter_json: string | null }>();
  if (hubs) {
    let titleZh = hubs.title;
    try {
      if (hubs.frontmatter_json) {
        const fm = JSON.parse(hubs.frontmatter_json);
        if (typeof fm.title_zh === "string" && fm.title_zh.trim()) titleZh = fm.title_zh.trim();
      }
    } catch { /* ignore */ }
    return {
      kind: "concept",
      emoji: "💡",
      title_en: `${DIVE_DEEPER_PREFIX.en} "${hubs.title}"`,
      title_zh: `${DIVE_DEEPER_PREFIX.zh}「${titleZh}」`,
      hint_en: `${YOU_CAPTURED.en} ${hubs.inbound_links} ${HUB_HINT_SUFFIX.en}`,
      hint_zh: `${YOU_CAPTURED.zh} ${hubs.inbound_links} ${HUB_HINT_SUFFIX.zh}`,
      href: `/wiki/${userId}/${hubs.path}`,
    };
  }
  // fall back to a domain we've barely touched
  const domains = await db
    .prepare(
      `SELECT primary_domain, COUNT(*) AS n FROM interactions
        WHERE user_id = ?1 AND analysis_status='done' AND primary_domain IS NOT NULL
        GROUP BY primary_domain`,
    )
    .bind(userId)
    .all<{ primary_domain: string; n: number }>();
  const counts: Record<string, number> = { history: 0, art: 0, science: 0, tech: 0, culture: 0 };
  for (const r of domains.results ?? []) counts[r.primary_domain] = r.n;
  const least = Object.entries(counts).sort((a, b) => a[1] - b[1])[0];
  const dom = least?.[0] ?? "art";
  const hint = ADV_DOMAIN_HINTS[dom] ?? ADV_DOMAIN_HINTS.art;
  return {
    kind: "domain",
    emoji: hint.emoji,
    title_en: ADV_EXPLORE_NEW.title_en,
    title_zh: ADV_EXPLORE_NEW.title_zh,
    hint_en: hint.en,
    hint_zh: hint.zh,
    href: "/me/timeline",
  };
}

export function pickAgeBand(): "5_7" | "8_10" | "11_13" {
  return "8_10";  // default
}

// Pull just the displayed-summary for the chosen age band, falling back to
// child_summary, then to first paragraph of the wiki body.
export function summaryForAge(
  fm: Record<string, unknown>,
  fallbackChildSummary: string | null,
  band: "5_7" | "8_10" | "11_13",
): string | null {
  const k = `summary_${band}` as const;
  const v = fm[k];
  if (typeof v === "string" && v.trim()) return v.trim();
  return fallbackChildSummary;
}

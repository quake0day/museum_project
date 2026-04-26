// Data assembly for the student home dashboard at /.
// Pure read-only — runs on every / request, but cheap (small queries).

import { evaluateQuests } from "./quests";
import type { QuestProgress } from "./quests";
import { listWikiPages, recentWikiLog } from "./db";
import type { WikiPageRow, WikiLogRow } from "./db";

export type RecentExhibit = {
  id: string;
  title: string;
  image: string;        // R2 key
  primary_domain: string | null;
  child_summary: string | null;
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
  title: string;
  hint: string;
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
                COALESCE(wp.title, 'Exhibit') AS title
           FROM interactions i
           LEFT JOIN wiki_pages wp
             ON wp.user_id = i.user_id AND wp.path = 'exhibits/' || i.id
          WHERE i.user_id = ?1 AND i.analysis_status = 'done'
          ORDER BY i.date DESC LIMIT 6`,
      )
      .bind(userId)
      .all<RecentExhibit>(),
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

  return {
    totals,
    recent: recentRows.results ?? [],
    inProgress,
    earnedRecent,
    nextAdventure,
    log,
  };
}

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
      title: "Capture your first exhibit",
      hint: "Open the MuseIQ app at the museum, take a photo of anything you find interesting, and write a quick reflection. The AI will turn it into your first wiki page.",
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
      title: `Almost there: ${close.title}`,
      hint: `${close.current} of ${close.target} — ${close.description}`,
      href: "/me/quests",
    };
  }
  // pick a hub concept page (one with the most inbound links) to suggest
  const hubs = await db
    .prepare(
      `SELECT path, title, kind, inbound_links
         FROM wiki_pages
        WHERE user_id = ?1 AND kind = 'concept' AND inbound_links >= 2
        ORDER BY inbound_links DESC LIMIT 1`,
    )
    .bind(userId)
    .first<{ path: string; title: string; kind: string; inbound_links: number }>();
  if (hubs) {
    return {
      kind: "concept",
      emoji: "💡",
      title: `Dive deeper into "${hubs.title}"`,
      hint: `You've captured ${hubs.inbound_links} exhibits that touch this concept — its page is one of the busiest hubs in your wiki.`,
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
  const labels: Record<string, [string, string]> = {
    history: ["🏺", "Try a history exhibit — an artifact from a past civilization."],
    art: ["🎨", "Try an art exhibit — a painting, sculpture, or photograph."],
    science: ["🦖", "Try a natural science exhibit — fossils, animals, or minerals."],
    tech: ["⚙️", "Try a technology exhibit — machines, instruments, or inventions."],
    culture: ["🌍", "Try a culture exhibit — clothing, music, festivals, or food."],
  };
  const [emoji, hint] = labels[least?.[0] ?? "art"];
  return {
    kind: "domain",
    emoji,
    title: `Explore something new`,
    hint,
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

// Live-rendered index.md and log.md views. These are the two "special"
// pages of the SCHEMA — they are not stored as rows; we generate the
// markdown on each request from wiki_pages and wiki_log.

import { listWikiPages, recentWikiLog } from "./db";
import type { WikiPageRow } from "./db";

const KIND_LABEL: Record<string, string> = {
  exhibit: "Exhibits",
  exhibit_unknown: "Exhibits (unidentified)",
  concept: "Concepts",
  place: "Places",
  period: "Periods",
  person: "People",
  style: "Styles",
  material: "Materials",
  technique: "Techniques",
  theme: "Themes",
  civilization: "Civilizations",
  museum: "Museums",
  visit: "Visits",
};

const KIND_ORDER = [
  "exhibit", "exhibit_unknown",
  "concept", "theme", "style",
  "period", "place", "civilization",
  "person", "material", "technique",
  "museum", "visit",
];

export async function buildIndexPage(
  db: D1Database,
  userId: string,
): Promise<{ title: string; body: string; pageCount: number }> {
  const pages = await listWikiPages(db, userId);
  const grouped: Record<string, WikiPageRow[]> = {};
  for (const p of pages) {
    if (p.path === "index" || p.path === "log") continue;
    (grouped[p.kind] = grouped[p.kind] || []).push(p);
  }

  const lines: string[] = [
    `# ${userId === "default" ? "" : userId + "'s "}MuseIQ wiki`,
    "",
    `> A living index of every page the AI has written from your captures. Click any link to dive in.`,
    "",
    `**${pages.length}** pages total — last updated ${pages[0]?.updated_at?.slice(0, 10) ?? "—"}.`,
    "",
  ];

  // Recent activity strip
  const recent = pages
    .filter((p) => p.path !== "index" && p.path !== "log")
    .sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""))
    .slice(0, 6);
  if (recent.length) {
    lines.push("## Recently updated", "");
    for (const r of recent) {
      const href = `/wiki/${userId}/${r.path}`;
      lines.push(`- [${r.title}](${href}) <span class="muted">· ${r.kind} · ${r.updated_at?.slice(0, 10) ?? ""}</span>`);
    }
    lines.push("");
  }

  // Per-kind sections, in our preferred order
  for (const kind of KIND_ORDER) {
    const list = grouped[kind];
    if (!list?.length) continue;
    const label = KIND_LABEL[kind] ?? kind;
    lines.push(`## ${label} (${list.length})`, "");
    list.sort((a, b) => a.title.localeCompare(b.title));
    for (const p of list) {
      const href = `/wiki/${userId}/${p.path}`;
      const summary = firstSummary(p);
      const meta = p.inbound_links > 0 ? ` <span class="muted">· ${p.inbound_links} link${p.inbound_links === 1 ? "" : "s"} in</span>` : "";
      lines.push(`- [${p.title}](${href})${summary ? ` — ${summary}` : ""}${meta}`);
    }
    lines.push("");
  }

  // Catch-all: any kinds we didn't explicitly order
  for (const [kind, list] of Object.entries(grouped)) {
    if (KIND_ORDER.includes(kind)) continue;
    if (!list.length) continue;
    lines.push(`## ${kind} (${list.length})`, "");
    for (const p of list) {
      lines.push(`- [${p.title}](/wiki/${userId}/${p.path})`);
    }
    lines.push("");
  }

  return {
    title: "Wiki index",
    body: lines.join("\n"),
    pageCount: pages.length,
  };
}

function firstSummary(p: WikiPageRow): string | null {
  // Prefer the body's opening blockquote (the one-sentence summary by SCHEMA).
  const m = p.body.match(/\n>\s+([^\n]+)/);
  if (m) return clip(m[1]);
  // fall back to body's first non-frontmatter, non-heading sentence
  const stripped = p.body.replace(/^---[\s\S]*?---\s*\n/, "").replace(/^#[^\n]*\n/m, "").trim();
  const first = stripped.split(/\n\n/)[0]?.replace(/[*_`#]+/g, "").trim();
  return first ? clip(first) : null;
}

function clip(s: string, n = 140): string {
  s = s.replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export async function buildLogPage(
  db: D1Database,
  userId: string,
): Promise<{ title: string; body: string }> {
  const rows = await recentWikiLog(db, userId, 200);
  const lines: string[] = [
    "# Wiki activity log",
    "",
    "> Append-only record of ingests, queries, and lint passes. Newest first.",
    "",
  ];
  if (!rows.length) {
    lines.push("*No activity yet.*");
  } else {
    for (const r of rows) {
      const date = r.ts.slice(0, 10);
      const href = r.ref_path ? ` → [${r.ref_path}](/wiki/${userId}/${r.ref_path})` : "";
      lines.push(`## [${date}] ${r.kind} | ${r.message}${href}`);
      lines.push("");
    }
  }
  return { title: "Wiki activity log", body: lines.join("\n") };
}

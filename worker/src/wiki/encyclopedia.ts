// Encyclopedia-style index data: every entity page is bucketed under a
// primary domain (Art / History / Science / Tech / Culture) by the modal
// domain of the exhibits that cite it. Pages with no inbound-exhibit
// signal land in "Other".

import type { WikiPageRow } from "./db";

export type Domain = "art" | "history" | "science" | "tech" | "culture" | "other";

export type EncyclopediaEntry = {
  path: string;
  title: string;
  title_zh: string | null;   // pulled from frontmatter when present (v4 bilingual ingest)
  kind: string;
  inbound_links: number;
  summary: string | null;
};

export type EncyclopediaSection = {
  domain: Domain;
  label: string;
  emoji: string;
  total: number;
  byKind: Record<string, EncyclopediaEntry[]>;
};

export type EncyclopediaData = {
  sections: EncyclopediaSection[];
  exhibitCount: number;
  totalPages: number;
  lastUpdated: string | null;
};

const DOMAIN_LABELS: Record<Domain, { label: string; emoji: string; rank: number }> = {
  art:     { label: "Art",             emoji: "🎨", rank: 0 },
  history: { label: "History",         emoji: "🏺", rank: 1 },
  science: { label: "Natural Science", emoji: "🦖", rank: 2 },
  tech:    { label: "Technology",      emoji: "⚙️", rank: 3 },
  culture: { label: "Culture",         emoji: "🌍", rank: 4 },
  other:   { label: "Other",           emoji: "✨", rank: 5 },
};

const ENTITY_KINDS = new Set([
  "concept", "place", "period", "person", "style",
  "material", "technique", "theme", "civilization",
]);

const KIND_LABEL: Record<string, string> = {
  concept: "Concepts",
  place: "Places",
  period: "Periods",
  person: "People",
  style: "Styles",
  material: "Materials",
  technique: "Techniques",
  theme: "Themes",
  civilization: "Civilizations",
};

const KIND_RANK: Record<string, number> = {
  // Per-domain preferred ordering. Kinds not listed go after.
  period: 0, civilization: 1, place: 2,
  style: 3, technique: 4, material: 5,
  person: 6, theme: 7, concept: 8,
};

export async function buildEncyclopedia(
  db: D1Database,
  userId: string,
): Promise<EncyclopediaData> {
  // Fetch all entity pages
  const pagesRes = await db
    .prepare(
      `SELECT user_id, path, kind, title, body, frontmatter_json, body_hash,
              source_count, inbound_links, outbound_links, last_ingest_at,
              created_at, updated_at
         FROM wiki_pages
        WHERE user_id = ?1`,
    )
    .bind(userId)
    .all<WikiPageRow>();

  const allPages = pagesRes.results ?? [];
  const entityPages = allPages.filter((p) => ENTITY_KINDS.has(p.kind));

  // Compute modal domain per entity page from inbound-exhibit links
  const domainQuery = await db
    .prepare(
      `SELECT wl.dst_path AS entity_path, i.primary_domain AS domain, COUNT(*) AS n
         FROM wiki_links wl
         JOIN wiki_pages wp_src
           ON wp_src.user_id = wl.user_id AND wp_src.path = wl.src_path
         JOIN interactions i
           ON i.user_id = wl.user_id AND wp_src.path = 'exhibits/' || i.id
        WHERE wl.user_id = ?1
          AND wp_src.kind IN ('exhibit','exhibit_unknown')
          AND i.primary_domain IS NOT NULL
        GROUP BY wl.dst_path, i.primary_domain`,
    )
    .bind(userId)
    .all<{ entity_path: string; domain: string; n: number }>();

  const modalDomain = new Map<string, string>();
  const domainCounts = new Map<string, Map<string, number>>();
  for (const r of domainQuery.results ?? []) {
    if (!domainCounts.has(r.entity_path)) domainCounts.set(r.entity_path, new Map());
    domainCounts.get(r.entity_path)!.set(r.domain, r.n);
  }
  for (const [path, counts] of domainCounts.entries()) {
    let best = "other";
    let max = 0;
    for (const [d, n] of counts.entries()) {
      if (n > max) { max = n; best = d; }
    }
    modalDomain.set(path, best);
  }

  // Per-kind heuristic fallback for entities that have zero inbound exhibits
  // (e.g. an entity created but no exhibit yet links to it). Style → Art,
  // civilization/period → History, etc.
  const kindFallback: Record<string, Domain> = {
    style: "art",
    civilization: "history",
    period: "history",
    place: "history",
    material: "history",
    technique: "art",
    person: "history",
    theme: "other",
    concept: "other",
  };

  // Bucket entity pages
  const sections = new Map<Domain, EncyclopediaSection>();
  for (const dom of Object.keys(DOMAIN_LABELS) as Domain[]) {
    sections.set(dom, {
      domain: dom,
      label: DOMAIN_LABELS[dom].label,
      emoji: DOMAIN_LABELS[dom].emoji,
      total: 0,
      byKind: {},
    });
  }

  for (const p of entityPages) {
    let dom: Domain = (modalDomain.get(p.path) as Domain) ?? kindFallback[p.kind] ?? "other";
    if (!sections.has(dom)) dom = "other";
    const sec = sections.get(dom)!;
    sec.byKind[p.kind] = sec.byKind[p.kind] ?? [];
    let titleZh: string | null = null;
    try {
      if (p.frontmatter_json) {
        const fm = JSON.parse(p.frontmatter_json);
        if (typeof fm.title_zh === "string" && fm.title_zh.trim()) titleZh = fm.title_zh.trim();
      }
    } catch { /* ignore */ }
    sec.byKind[p.kind].push({
      path: p.path,
      title: p.title,
      title_zh: titleZh,
      kind: p.kind,
      inbound_links: p.inbound_links,
      summary: extractFirstSummary(p),
    });
    sec.total++;
  }

  // Sort entries inside each kind alphabetically
  for (const sec of sections.values()) {
    for (const k of Object.keys(sec.byKind)) {
      sec.byKind[k].sort((a, b) => a.title.localeCompare(b.title));
    }
  }

  // Exhibit count
  const exRes = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM interactions WHERE user_id = ?1 AND analysis_status = 'done'`,
    )
    .bind(userId)
    .first<{ n: number }>();
  const exhibitCount = exRes?.n ?? 0;

  // Last updated
  const lastRes = await db
    .prepare(
      `SELECT MAX(updated_at) AS ts FROM wiki_pages WHERE user_id = ?1`,
    )
    .bind(userId)
    .first<{ ts: string | null }>();

  // Order sections by rank, drop empty domains except keep one if no
  // exhibits at all (so the page isn't a complete blank).
  const ordered = (Array.from(sections.values()))
    .sort((a, b) => DOMAIN_LABELS[a.domain].rank - DOMAIN_LABELS[b.domain].rank)
    .filter((s) => s.total > 0);

  return {
    sections: ordered,
    exhibitCount,
    totalPages: entityPages.length,
    lastUpdated: lastRes?.ts ?? null,
  };
}

function extractFirstSummary(p: WikiPageRow): string | null {
  // Prefer the body's opening blockquote (the one-sentence definition)
  const m = p.body.match(/\n>\s+([^\n]+)/);
  if (m) return clip(m[1], 140);
  return null;
}

function clip(s: string, n: number): string {
  s = s.replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export function kindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? kind;
}

export function kindRank(kind: string): number {
  return KIND_RANK[kind] ?? 99;
}

export { DOMAIN_LABELS };

// Deterministic wiki health check. Pure SQL — no LLM call. Surfaces orphan
// pages, dangling links, missing entity pages, empty pages, and stale pages.

import { listWikiPages } from "./db";
import type { WikiPageRow } from "./db";

export type LintFinding = {
  severity: "info" | "warn" | "error";
  category: string;
  path: string | null;
  message: string;
};

export async function runLint(
  db: D1Database,
  userId: string,
): Promise<LintFinding[]> {
  const findings: LintFinding[] = [];
  const pages = await listWikiPages(db, userId);
  const byPath = new Map<string, WikiPageRow>();
  for (const p of pages) byPath.set(p.path, p);

  // 1. orphan entity pages: kind is concept/etc and inbound_links === 0
  const ENTITY_KINDS = new Set([
    "concept", "place", "period", "person", "style",
    "material", "technique", "theme", "civilization",
  ]);
  for (const p of pages) {
    if (!ENTITY_KINDS.has(p.kind)) continue;
    if (p.inbound_links === 0) {
      findings.push({
        severity: "warn",
        category: "orphan",
        path: p.path,
        message: `Entity page has no inbound links — created but never re-cited.`,
      });
    }
  }

  // 2. dangling outbound links — references to pages that don't exist
  const links = await db
    .prepare("SELECT src_path, dst_path FROM wiki_links WHERE user_id = ?1")
    .bind(userId)
    .all<{ src_path: string; dst_path: string }>();
  for (const l of links.results ?? []) {
    if (!byPath.has(l.dst_path)) {
      findings.push({
        severity: "error",
        category: "dangling-link",
        path: l.src_path,
        message: `Links to ${l.dst_path} but no such page exists.`,
      });
    }
  }

  // 3. empty / stub pages
  for (const p of pages) {
    if (p.body.length < 250 && p.kind !== "exhibit_unknown") {
      findings.push({
        severity: "warn",
        category: "empty",
        path: p.path,
        message: `Page body is unusually short (${p.body.length} chars).`,
      });
    }
  }

  // 4. stale: not updated in 90 days AND inbound_links > 0 (cited but not refreshed)
  const ninetyDays = 90 * 24 * 3600 * 1000;
  const now = Date.now();
  for (const p of pages) {
    const ts = p.updated_at ? Date.parse(p.updated_at) : NaN;
    if (Number.isFinite(ts) && (now - ts) > ninetyDays && p.inbound_links > 0) {
      findings.push({
        severity: "info",
        category: "stale",
        path: p.path,
        message: `Last updated ${new Date(ts).toISOString().slice(0, 10)} but ${p.inbound_links} pages still cite it.`,
      });
    }
  }

  // 5. missing entity pages: any frontmatter slug that has no page
  for (const p of pages) {
    if (!p.frontmatter_json) continue;
    let fm: Record<string, unknown> = {};
    try { fm = JSON.parse(p.frontmatter_json); } catch { continue; }
    const checks: Array<[keyof typeof fm, string]> = [
      ["period", "periods"], ["place", "places"], ["museum", "museums"],
    ];
    for (const [field, prefix] of checks) {
      const slug = fm[field];
      if (typeof slug !== "string" || !slug) continue;
      const ePath = `${prefix}/${slug}`;
      if (!byPath.has(ePath)) {
        findings.push({
          severity: "info",
          category: "missing-page",
          path: p.path,
          message: `References ${prefix}/${slug} in frontmatter but no such page exists yet.`,
        });
      }
    }
  }

  // 6. low confidence
  for (const p of pages) {
    if (p.kind === "exhibit_unknown") {
      findings.push({
        severity: "info",
        category: "unknown",
        path: p.path,
        message: `Unidentified exhibit — re-ingest after the child adds a description, or capture a label.`,
      });
    }
  }

  // sort by severity
  const order: Record<string, number> = { error: 0, warn: 1, info: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  return findings;
}

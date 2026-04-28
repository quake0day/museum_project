// Translate a single-language wiki entity page into bilingual form.
// Used by the cron handler to clean up entity pages that survived an
// exhibit re-ingest at ANALYSIS_VERSION 4 without being themselves
// rewritten — typically because no exhibit listed them in the
// entity_pages envelope on re-ingest, even though wiki_links still
// pointed at them.
//
// We don't go through the full ingest pipeline (which would also re-
// classify the originating exhibit) — just one LLM call that takes the
// existing English markdown and emits matching Chinese, plus a
// title_zh value, then writes back via writePage so the indexer mirrors
// the new frontmatter.

import type { AiProvider } from "../ai";
import { writePage } from "./write_page";
import type { WikiPageRow } from "./db";

export type TranslateResult = {
  ok: boolean;
  error?: string;
};

export async function translateEntityPage(
  ai: AiProvider,
  db: D1Database,
  page: WikiPageRow,
): Promise<TranslateResult> {
  // Already bilingual? Skip.
  if (page.body.includes('data-lang="zh"')) return { ok: true };

  // Strip frontmatter, keep just the existing markdown content (which is
  // English). The LLM gets that as the source.
  const m = page.body.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  const fmText = m ? m[1] : "";
  const englishBody = m ? m[2] : page.body;

  let fm: Record<string, unknown> = {};
  try { fm = page.frontmatter_json ? JSON.parse(page.frontmatter_json) : {}; } catch { /* ignore */ }

  const messages = [
    {
      role: "system" as const,
      content: `You translate a museum-wiki entity page from English to
Simplified Chinese (zh-CN) for a child age 5–13. Output STRICT JSON
with two top-level keys: "title_zh" (a 1–6 word Chinese title) and
"body_zh" (the full body translated, preserving markdown headings,
blockquotes, lists, and internal wiki links exactly).

DO NOT translate URLs in [text](path) — keep the path bytes, only
translate the text inside the brackets. Reading level: grade 3–4.
Keep wiki link targets stable. No extra prose around the JSON.`,
    },
    {
      role: "user" as const,
      content: `Page kind: ${page.kind}
English title: ${page.title}

English body markdown:
"""
${englishBody}
"""

Return JSON now.`,
    },
  ];

  let raw: string;
  try {
    const res = await ai.chat({ messages, json: true, temperature: 0.3, maxTokens: 2400 });
    raw = res.text.trim();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  let parsed: { title_zh?: string; body_zh?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "translation JSON parse failed" };
  }
  const title_zh = (parsed.title_zh ?? "").trim();
  const body_zh = (parsed.body_zh ?? "").trim();
  if (!title_zh || !body_zh || body_zh.length < 30) {
    return { ok: false, error: "translation missing title_zh or body_zh" };
  }

  // Compose the new bilingual body. Start with the existing frontmatter
  // (with title_zh added/overwritten), then two paired data-lang divs
  // around the EN and ZH markdown. Same shape the ingest envelope
  // produces.
  fm.title_zh = title_zh;
  const fmYaml = renderYaml(fm);
  const newBody =
    `---\n${fmYaml}---\n\n` +
    `<div data-lang="en">\n\n${englishBody.trim()}\n\n</div>\n` +
    `<div data-lang="zh">\n\n${body_zh}\n\n</div>\n`;

  await writePage(db, {
    userId: page.user_id,
    path: page.path,
    kind: page.kind,
    title: page.title,
    body: newBody,
    sourceCount: page.source_count,
    lastIngestAt: new Date().toISOString(),
  });
  return { ok: true };
}

function renderYaml(fm: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(fm)) {
    if (v === null || v === undefined) continue;
    if (Array.isArray(v)) {
      lines.push(`${k}: [${v.map((x) => yamlScalar(x)).join(", ")}]`);
    } else {
      lines.push(`${k}: ${yamlScalar(v)}`);
    }
  }
  return lines.join("\n") + "\n";
}

function yamlScalar(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  const s = String(v);
  if (/^[A-Za-z0-9_\-./:+]+$/.test(s)) return s;
  return JSON.stringify(s);
}

// Find entity pages that haven't been bilingualized yet — used by the
// cron handler to drain them in small batches.
export async function findStaleEntityPages(
  db: D1Database,
  userId: string,
  limit: number,
): Promise<WikiPageRow[]> {
  const res = await db
    .prepare(
      `SELECT * FROM wiki_pages
        WHERE user_id = ?1
          AND kind NOT IN ('exhibit','exhibit_unknown','index','log')
          AND instr(body, 'data-lang="zh"') = 0
        ORDER BY inbound_links DESC, last_ingest_at ASC
        LIMIT ?2`,
    )
    .bind(userId, limit)
    .all<WikiPageRow>();
  return res.results ?? [];
}

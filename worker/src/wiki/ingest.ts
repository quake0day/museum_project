// Ingest orchestrator (v0.5):
//   raw interaction → 1 LLM call → 1 exhibit wiki page + denorm fields on
//   the legacy interactions row + wiki_log entry.
//
// v0.6 will add multi-page entity composition. This file is the single
// place to extend.

import type { AiProvider } from "../ai";
import { AiError } from "../ai";
import { buildIngestPrompt, INGEST_ANALYSIS_VERSION } from "../ai/prompts";
import { appendWikiLog, getWikiPage } from "./db";
import { writePage } from "./write_page";
import { parseFrontmatter } from "./util";

export type IngestInput = {
  exhibitId: string;
  userId: string;
  description: string;
  capturedAt: string;
  imageHint?: string;
};

export type IngestResult = {
  status: "done" | "failed" | "skipped";
  pageWritten: boolean;
  error?: string;
  classify?: ClassifyOut;
  entityPagesWritten?: number;
  entityPagesSkipped?: number;
  rawText?: string;
};

type ClassifyOut = {
  primary_domain: string;
  secondary_domains?: string[];
  object_type?: string;
  confidence: number;
  notes?: string;
};

type EntityPage = {
  kind: string;
  slug: string;
  title: string;
  body: string;          // full markdown including frontmatter
};

type Envelope = {
  classify: ClassifyOut;
  exhibit_page: {
    title: string;
    frontmatter: Record<string, unknown>;
    body: string;
  };
  entity_pages?: EntityPage[];
};

export async function ingestExhibit(
  ai: AiProvider,
  db: D1Database,
  input: IngestInput,
): Promise<IngestResult> {
  // 1. mark interactions row as running
  await db
    .prepare(
      "UPDATE interactions SET analysis_status = 'running', analysis_error = NULL WHERE id = ?1",
    )
    .bind(input.exhibitId)
    .run();

  let envelope: Envelope;
  let rawText = "";
  try {
    envelope = await callIngestLLM(ai, input);
    rawText = JSON.stringify(envelope).slice(0, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db
      .prepare(
        "UPDATE interactions SET analysis_status = 'failed', analysis_error = ?2, analyzed_at = ?3 WHERE id = ?1",
      )
      .bind(input.exhibitId, msg.slice(0, 800), new Date().toISOString())
      .run();
    return { status: "failed", pageWritten: false, error: msg };
  }

  // 2. derive denorm fields from frontmatter
  const fm = envelope.exhibit_page.frontmatter || {};
  const primaryDomain = stringOr(fm.domain, envelope.classify.primary_domain);
  const objectType = stringOr(fm.object_type, envelope.classify.object_type ?? null);
  const approxYear = numberOrNull(fm.approx_year);
  const lat = numberOrNull(fm.origin_lat);
  const lon = numberOrNull(fm.origin_lon);

  // 3. write the wiki page
  const pagePath = `exhibits/${input.exhibitId}`;
  const bodyMd = ensureMarkdownEnvelope(
    envelope.exhibit_page.body,
    envelope.exhibit_page.title,
    fm,
  );
  await writePage(db, {
    userId: input.userId,
    path: pagePath,
    kind: stringOr(fm.kind, "exhibit") ?? "exhibit",
    title: envelope.exhibit_page.title,
    body: bodyMd,
    sourceCount: 1,
    lastIngestAt: new Date().toISOString(),
  });

  // 3.5 write entity pages (first-write-wins for v0.6 — augmenting prose
  // arrives in v0.7). Existing pages keep their body but the wiki_links
  // edge from the new exhibit still points at them, so the page's
  // inbound_links count grows automatically.
  let entityPagesWritten = 0;
  let entityPagesSkipped = 0;
  const entities = envelope.entity_pages ?? [];
  for (const e of entities) {
    const epPath = `${entityPathPrefix(e.kind)}/${e.slug}`;
    const existing = await getWikiPage(db, input.userId, epPath);
    if (existing) {
      // bump source_count so the page reflects "N exhibits cite me"
      await db
        .prepare(
          "UPDATE wiki_pages SET source_count = source_count + 1, updated_at = ?3 WHERE user_id = ?1 AND path = ?2",
        )
        .bind(input.userId, epPath, new Date().toISOString())
        .run();
      entityPagesSkipped++;
      continue;
    }
    try {
      await writePage(db, {
        userId: input.userId,
        path: epPath,
        kind: e.kind,
        title: e.title,
        body: e.body,
        sourceCount: 1,
        lastIngestAt: new Date().toISOString(),
      });
      entityPagesWritten++;
    } catch (err) {
      console.error("entity write failed", epPath, err instanceof Error ? err.message : err);
    }
  }

  // 4. update interactions row
  const childSummary = extractChildSummary(bodyMd);
  await db
    .prepare(
      `UPDATE interactions SET
         analysis_status = 'done',
         analysis_version = ?2,
         analysis_provider = ?3,
         analyzed_at = ?4,
         analysis_error = NULL,
         primary_domain = ?5,
         object_type = ?6,
         approx_year = ?7,
         origin_lat = ?8,
         origin_lon = ?9,
         child_summary = ?10
       WHERE id = ?1`,
    )
    .bind(
      input.exhibitId,
      INGEST_ANALYSIS_VERSION,
      ai.name,
      new Date().toISOString(),
      primaryDomain,
      objectType,
      approxYear,
      lat,
      lon,
      childSummary,
    )
    .run();

  // 5. append log
  await appendWikiLog(
    db,
    input.userId,
    "ingest",
    pagePath,
    `Ingested ${envelope.exhibit_page.title} (${primaryDomain ?? "?"}, conf ${envelope.classify.confidence.toFixed(2)}, +${entityPagesWritten} new entity pages, ${entityPagesSkipped} reused)`,
    {
      object_type: objectType,
      entity_pages_written: entityPagesWritten,
      entity_pages_reused: entityPagesSkipped,
      provider: ai.name,
    },
  );

  return {
    status: "done",
    pageWritten: true,
    classify: envelope.classify,
    entityPagesWritten,
    entityPagesSkipped,
    rawText,
  };
}

function entityPathPrefix(kind: string): string {
  // Pluralize entity kinds for path prefix per SCHEMA.md.
  const map: Record<string, string> = {
    concept: "concepts",
    place: "places",
    period: "periods",
    person: "people",
    style: "styles",
    material: "materials",
    technique: "techniques",
    theme: "themes",
    civilization: "civilizations",
    museum: "museums",
  };
  return map[kind] ?? kind;
}

// ─── LLM call + parsing ─────────────────────────────────────────────

const MAX_RETRIES = 2;

async function callIngestLLM(ai: AiProvider, input: IngestInput): Promise<Envelope> {
  const { system, user } = buildIngestPrompt(input);
  let lastErr: string | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const messages = [
      { role: "system" as const, content: system },
      { role: "user" as const, content: user },
    ];
    if (lastErr) {
      messages.push({
        role: "user" as const,
        content: `Your previous response could not be parsed: ${lastErr}\nReturn a single valid JSON object per the schema.`,
      });
    }

    let result;
    try {
      result = await ai.chat({ messages, json: true, temperature: 0.4, maxTokens: 2400 });
    } catch (e) {
      if (e instanceof AiError && e.retriable && attempt < MAX_RETRIES) {
        await sleep(500 * (attempt + 1));
        continue;
      }
      throw e;
    }

    try {
      const obj = parseJsonLoose(result.text);
      const envelope = validateEnvelope(obj);
      return envelope;
    } catch (e) {
      lastErr = (e instanceof Error ? e.message : String(e)).slice(0, 400);
      if (attempt === MAX_RETRIES) {
        throw new Error(`ingest JSON validation failed after ${MAX_RETRIES + 1} attempts: ${lastErr}`);
      }
    }
  }
  throw new Error("unreachable");
}

function parseJsonLoose(text: string): unknown {
  // Some providers wrap JSON in fences despite json mode being requested.
  const trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    const m = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
    if (m) return JSON.parse(m[1]);
  }
  return JSON.parse(trimmed);
}

function validateEnvelope(obj: unknown): Envelope {
  if (!obj || typeof obj !== "object") throw new Error("not an object");
  const o = obj as Record<string, unknown>;
  const c = o.classify as Record<string, unknown> | undefined;
  if (!c || typeof c !== "object") throw new Error("missing .classify");
  if (typeof c.primary_domain !== "string") throw new Error("classify.primary_domain not string");
  const conf = typeof c.confidence === "number" ? c.confidence : NaN;
  if (!Number.isFinite(conf) || conf < 0 || conf > 1) throw new Error("classify.confidence out of range");

  const ep = o.exhibit_page as Record<string, unknown> | undefined;
  if (!ep || typeof ep !== "object") throw new Error("missing .exhibit_page");
  if (typeof ep.title !== "string" || !ep.title.trim()) throw new Error("exhibit_page.title missing");
  if (typeof ep.body !== "string" || ep.body.length < 50) throw new Error("exhibit_page.body too short");

  const fm = (ep.frontmatter && typeof ep.frontmatter === "object")
    ? (ep.frontmatter as Record<string, unknown>)
    : {};

  // entity_pages — accept absent or empty, validate items leniently
  const rawEntities = Array.isArray(o.entity_pages) ? o.entity_pages : [];
  const entity_pages: EntityPage[] = [];
  for (const e of rawEntities) {
    if (!e || typeof e !== "object") continue;
    const er = e as Record<string, unknown>;
    if (typeof er.kind !== "string" || typeof er.slug !== "string" ||
        typeof er.title !== "string" || typeof er.body !== "string") continue;
    if (!ENTITY_KINDS.has(er.kind)) continue;
    if (er.body.length < 30) continue;
    entity_pages.push({
      kind: er.kind,
      slug: slugSafe(er.slug),
      title: er.title.trim().slice(0, 120),
      body: er.body,
    });
    if (entity_pages.length >= 12) break;
  }

  return {
    classify: {
      primary_domain: String(c.primary_domain),
      secondary_domains: Array.isArray(c.secondary_domains) ? (c.secondary_domains as string[]) : [],
      object_type: typeof c.object_type === "string" ? c.object_type : undefined,
      confidence: conf,
      notes: typeof c.notes === "string" ? c.notes : undefined,
    },
    exhibit_page: {
      title: String(ep.title),
      frontmatter: fm,
      body: String(ep.body),
    },
    entity_pages,
  };
}

const ENTITY_KINDS = new Set([
  "concept", "place", "period", "person", "style",
  "material", "technique", "theme", "civilization", "museum",
]);

function slugSafe(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

// If the LLM forgot the YAML frontmatter at the top of the body, prepend it
// from the structured frontmatter object so writePage can index it.
function ensureMarkdownEnvelope(
  body: string,
  title: string,
  fm: Record<string, unknown>,
): string {
  if (body.trimStart().startsWith("---")) return body;
  const yaml = ["---"];
  for (const [k, v] of Object.entries(fm)) yaml.push(`${k}: ${yamlScalar(v)}`);
  yaml.push("---", "");
  if (!body.trimStart().startsWith("# ")) {
    yaml.push(`# ${title}`, "");
  }
  return yaml.join("\n") + body;
}

function yamlScalar(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return "[" + v.map((x) => yamlScalar(x)).join(", ") + "]";
  const s = String(v);
  if (/^[A-Za-z0-9_\-./:+]+$/.test(s)) return s;
  return JSON.stringify(s);
}

function extractChildSummary(body: string): string | null {
  // The schema says the body opens with `> ...` after the `# Title` line.
  const m = body.match(/^>\s+(.+)(?:\n>\s+(.+))*$/m);
  if (!m) return null;
  // m[0] is the first blockquote line; pull the whole consecutive blockquote block.
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((l) => /^>\s+/.test(l));
  if (start < 0) return null;
  const buf: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const ln = lines[i];
    if (/^>\s*/.test(ln)) buf.push(ln.replace(/^>\s?/, "").trim());
    else if (ln.trim() === "" && buf.length) break;
    else if (!/^>/.test(ln)) break;
  }
  return buf.join(" ").trim() || null;
}

function stringOr(v: unknown, fallback: string | null): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  return fallback;
}

function numberOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

import schema from "../wiki/SCHEMA.md";

const ANALYSIS_VERSION = 3;

export type IngestPromptInput = {
  exhibitId: string;
  userId: string;
  description: string;       // child-typed reflection (the `response` field)
  capturedAt: string;        // ISO
  imageHint?: string;        // path/filename, in case it carries info
  language?: string;         // default "en"
  existingEntities?: Array<{ kind: string; slug: string; title: string; body: string }>;
};

export function buildIngestPrompt(input: IngestPromptInput): {
  system: string;
  user: string;
} {
  const lang = input.language || "en";

  // The schema doc IS the system prompt body — that's the point.
  // We append a concise output-envelope contract so the LLM emits valid
  // JSON we can parse without a follow-up.
  const system = `You are the wiki maintainer for MuseIQ, governed by the
schema below. Read it once and obey it. The current ANALYSIS_VERSION you must
stamp on every page you produce is ${ANALYSIS_VERSION}.

Output language: ${lang}.

You will receive ONE raw source: a child's photo + their typed reflection.
You will return ONE JSON object matching the "Output envelope" section.
The "exhibit_page.body" string MUST be valid markdown that begins with the
YAML frontmatter (--- … ---) and follows the body structure rules.

──────────── BEGIN SCHEMA ────────────
${schema as unknown as string}
──────────── END SCHEMA ────────────

JSON output rules:
- Return a single JSON object. No markdown fence around the JSON. No prose
  before or after.
- Top-level keys: classify, exhibit_page, entity_pages.
- exhibit_page.frontmatter is the parsed object form of the YAML you also
  embed at the top of exhibit_page.body — they MUST agree exactly.
- exhibit_page.frontmatter MUST include the three age-graded summaries
  (summary_5_7, summary_8_10, summary_11_13) when confidence ≥ 0.5.
- entity_pages: 3–10 items typical. Each item is a fully-formed wiki page
  ({kind, slug, title, body}) where body is valid markdown WITH frontmatter,
  following the entity-page section structure. Only include entities you
  reference in the exhibit body.
- If confidence < 0.3, set kind = "exhibit_unknown" in frontmatter, write a
  short body asking the child for more clues, and return entity_pages = [].
- Substitute the literal string {user} for the user id in any internal
  links — the runtime replaces it. Example:
    [Bronze Age](/wiki/{user}/concepts/bronze-age) <!-- rel:teaches -->
- Keep total response under ~3500 tokens. If you must trim, drop entity_pages
  before trimming the exhibit page.
`;

  const existingBlock = (input.existingEntities ?? []).length
    ? `

EXISTING ENTITY PAGES IN THIS WIKI (you may augment any of these by emitting
an entity_pages item with the same kind+slug; your body will REPLACE the
existing one, so you MUST preserve the prior content faithfully and add new
evidence as new sentences. Do NOT silently delete prior facts.):

${(input.existingEntities ?? []).map((e) => `--- ${e.kind}/${e.slug} (${e.title}) ---\n${truncate(e.body, 1200)}`).join("\n\n")}
`
    : "";

  const user = `Source for exhibit ${input.exhibitId}:

- captured_at: ${input.capturedAt}
- image filename hint: ${input.imageHint ?? "(none)"}
- child's typed reflection:
"""
${input.description || "(the child did not type anything)"}
"""${existingBlock}

Now produce the JSON envelope per the schema.`;

  return { system, user };
}

export const INGEST_ANALYSIS_VERSION = ANALYSIS_VERSION;

function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

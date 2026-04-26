import schema from "../wiki/SCHEMA.md";

const ANALYSIS_VERSION = 1;

export type IngestPromptInput = {
  exhibitId: string;
  userId: string;
  description: string;       // child-typed reflection (the `response` field)
  capturedAt: string;        // ISO
  imageHint?: string;        // path/filename, in case it carries info
  language?: string;         // default "en"
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
- Keys: classify, exhibit_page, linked_entities.
- exhibit_page.frontmatter is the parsed object form of the YAML you also
  embed at the top of exhibit_page.body — they MUST agree.
- linked_entities is a flat array; each item: {kind, slug, title}. 3–10
  items typical. Only include entities you actually reference in the body.
- If confidence < 0.3, set kind = "exhibit_unknown" in frontmatter and
  produce a short body that asks the child for more clues. linked_entities
  may be empty.
- Substitute the literal string {user} for the user id in any internal
  links — the runtime will replace it. Example:
    [Bronze Age](/wiki/{user}/concepts/bronze-age) <!-- rel:teaches -->
`;

  const user = `Source for exhibit ${input.exhibitId}:

- captured_at: ${input.capturedAt}
- image filename hint: ${input.imageHint ?? "(none)"}
- child's typed reflection:
"""
${input.description || "(the child did not type anything)"}
"""

Now produce the JSON envelope per the schema.`;

  return { system, user };
}

export const INGEST_ANALYSIS_VERSION = ANALYSIS_VERSION;

// Q&A grounded in the child's wiki. Two-phase RAG:
//   1. shortlist candidate pages from the index (cheap LLM call)
//   2. answer with the bodies of those pages (the real call)
//
// Citations always point at the child's own wiki paths. Notable answers
// (comparisons, themed walkthroughs) MAY be filed back as new wiki pages
// in future versions; v1.1 just returns the markdown.

import type { AiProvider } from "../ai";
import { listWikiPages, getWikiPage, appendWikiLog } from "./db";
import type { WikiPageRow } from "./db";

export type AskInput = {
  userId: string;
  question: string;
  contextPath?: string;     // optional: anchor page (e.g., the exhibit the child was on)
  language?: string;        // default "en"
};

export type AskOutput = {
  answerMd: string;
  citations: Array<{ path: string; title: string; kind: string }>;
  shortlistedPaths: string[];
  rawShortlistText?: string;
  totalCalls: number;
};

const MAX_PAGES_IN_PROMPT = 8;

export async function askWiki(
  ai: AiProvider,
  db: D1Database,
  input: AskInput,
): Promise<AskOutput> {
  const lang = input.language || "en";
  const allPages = await listWikiPages(db, input.userId);
  const indexLines = allPages
    .filter((p) => p.path !== "index" && p.path !== "log")
    .map((p) => `- ${p.path} | ${p.kind} | ${p.title}`);

  // Phase 1: shortlist
  const shortlistMessages = [
    {
      role: "system" as const,
      content: `You are a librarian for a child's personal museum wiki. Given a
question and the index of pages in the wiki, return up to ${MAX_PAGES_IN_PROMPT}
page paths most likely to contain the answer. Output STRICT JSON: {"paths":["..."]}.
Prefer pages that the child captured themselves (anything under exhibits/) when
the question is about something they saw. Do NOT invent paths — every path you
output must appear in the provided index.`,
    },
    {
      role: "user" as const,
      content: `Question: ${input.question}
${input.contextPath ? `Anchor page: ${input.contextPath}` : ""}

Wiki index (path | kind | title):
${indexLines.join("\n")}

Return JSON.`,
    },
  ];

  const shortlistRes = await ai.chat({
    messages: shortlistMessages,
    json: true,
    temperature: 0.2,
    maxTokens: 600,
  });

  let paths: string[] = [];
  try {
    const obj = JSON.parse(shortlistRes.text) as { paths?: unknown };
    if (Array.isArray(obj.paths)) {
      paths = (obj.paths as unknown[])
        .filter((p): p is string => typeof p === "string")
        .filter((p) => allPages.some((wp) => wp.path === p))
        .slice(0, MAX_PAGES_IN_PROMPT);
    }
  } catch {
    // fall through with empty paths; we'll degrade gracefully
  }

  // Always include the anchor page if provided
  if (input.contextPath && !paths.includes(input.contextPath)) {
    paths = [input.contextPath, ...paths].slice(0, MAX_PAGES_IN_PROMPT);
  }

  // Phase 2: answer
  const pages: WikiPageRow[] = [];
  for (const p of paths) {
    const row = await getWikiPage(db, input.userId, p);
    if (row) pages.push(row);
  }

  const answerMessages = [
    {
      role: "system" as const,
      content: `You are a friendly tutor answering a child age 5–13. You have
been given a small set of wiki pages from the child's own museum collection.
Use ONLY information present in those pages plus very common general knowledge
that any encyclopedia would confirm. NEVER invent specific dates, artist names,
museum names, or quotations.

Voice: warm, concrete, second-person. Reading level: grade 3–4. Length: 4–8
sentences unless the question demands more.

Citations: every claim that comes from a wiki page must end with a citation
link in standard markdown form. Citations always point at the child's own pages
under /wiki/${input.userId}/<path>. Example:

  Bronze was the most advanced metal of its time
  ([Bronze](/wiki/${input.userId}/materials/bronze)).

If you cannot answer from the supplied pages, say so plainly and suggest what
the child could capture next to learn more.

Output language: ${lang}. Output strictly markdown — no JSON, no preamble.`,
    },
    {
      role: "user" as const,
      content: `Question: ${input.question}

Pages from the wiki (use these):

${pages.map((p) => `### ${p.path} (${p.kind}) — ${p.title}\n\n${truncate(p.body, 1800)}`).join("\n\n---\n\n")}

Answer the question now.`,
    },
  ];

  const answerRes = await ai.chat({
    messages: answerMessages,
    temperature: 0.5,
    maxTokens: 1500,
  });

  // Log the query
  await appendWikiLog(
    db,
    input.userId,
    "query",
    input.contextPath ?? null,
    `Q: ${truncate(input.question, 120)}`,
    { cited: pages.map((p) => p.path) },
  );

  return {
    answerMd: answerRes.text.trim(),
    citations: pages.map((p) => ({ path: p.path, title: p.title, kind: p.kind })),
    shortlistedPaths: paths,
    rawShortlistText: shortlistRes.text.slice(0, 500),
    totalCalls: 2,
  };
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

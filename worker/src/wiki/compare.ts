// Compare two wiki pages (typically two exhibits) and produce a kid-friendly
// similarities/differences breakdown. Single LLM call.

import type { AiProvider } from "../ai";
import { getWikiPage, appendWikiLog } from "./db";

export type CompareInput = {
  userId: string;
  pathA: string;
  pathB: string;
};

export type CompareOutput = {
  titleA: string;
  titleB: string;
  answerMd: string;
};

export async function comparePages(
  ai: AiProvider,
  db: D1Database,
  input: CompareInput,
): Promise<CompareOutput> {
  const a = await getWikiPage(db, input.userId, input.pathA);
  const b = await getWikiPage(db, input.userId, input.pathB);
  if (!a) throw new Error(`page not found: ${input.pathA}`);
  if (!b) throw new Error(`page not found: ${input.pathB}`);

  const messages = [
    {
      role: "system" as const,
      content: `You compare two wiki pages from a child's museum collection and
write a SHORT, kid-friendly comparison. Address the child as "you". Reading
level grade 3–4. Be specific — point at things in the pages. Cite both pages
in the body using markdown links to /wiki/${input.userId}/<path>.

Output strictly markdown with these three sections:

## What's similar
2–4 bullets

## What's different
2–4 bullets

## Why it's worth comparing
1–2 sentences — what concept this comparison illuminates.

Use ONLY information present in the two pages plus very common general
knowledge. Do not invent specific dates, artist names, or quotations.`,
    },
    {
      role: "user" as const,
      content: `Compare these two pages.

### A — ${a.path} (${a.kind}) — ${a.title}

${truncate(a.body, 1800)}

---

### B — ${b.path} (${b.kind}) — ${b.title}

${truncate(b.body, 1800)}

Now write the comparison.`,
    },
  ];

  const res = await ai.chat({ messages, temperature: 0.5, maxTokens: 1200 });

  await appendWikiLog(db, input.userId, "query", null, `Compared ${a.title} ↔ ${b.title}`, {
    pathA: a.path, pathB: b.path,
  });

  return {
    titleA: a.title,
    titleB: b.title,
    answerMd: res.text.trim(),
  };
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

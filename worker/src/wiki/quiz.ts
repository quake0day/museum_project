// Generate a small quiz (4 questions) for any wiki page. One LLM call.
// Output is structured JSON; the renderer turns it into an interactive form
// that scores client-side.

import type { AiProvider } from "../ai";
import { getWikiPage } from "./db";

export type QuizInput = {
  userId: string;
  path: string;
  ageBand?: "5_7" | "8_10" | "11_13";
};

export type QuizQuestion = {
  prompt: string;
  type: "mcq" | "free";
  choices?: string[];          // for mcq, length 4
  correct_index?: number;      // for mcq, 0..3
  hint?: string;
  explanation: string;         // shown after answering
};

export type QuizOutput = {
  pageTitle: string;
  pagePath: string;
  questions: QuizQuestion[];
};

export async function generateQuiz(
  ai: AiProvider,
  db: D1Database,
  input: QuizInput,
): Promise<QuizOutput> {
  const page = await getWikiPage(db, input.userId, input.path);
  if (!page) throw new Error(`page not found: ${input.path}`);
  const ageBand = input.ageBand ?? "8_10";

  const messages = [
    {
      role: "system" as const,
      content: `You write small quizzes for a child age ${ageBand.replace("_", "–")} based on a single
wiki page. Output STRICT JSON only — no markdown fence, no prose around the JSON.

Schema:
{
  "questions": [
    {
      "prompt": "string (one short question)",
      "type": "mcq" | "free",
      "choices": ["A","B","C","D"]   // only for mcq, exactly 4 plausible options
      "correct_index": 0..3,         // only for mcq
      "hint": "string (optional, kid-friendly)",
      "explanation": "string (1–2 sentences explaining the right answer, kind tone)"
    }
  ]
}

Rules:
- Exactly 4 questions total.
- 3 of them mcq, 1 of them free (an open-ended "look closely" prompt).
- For mcq: 4 plausible choices, exactly one correct. Avoid trick questions.
- Use ONLY information present in the wiki page; do not invent facts.
- Reading level: grade 3–4 for ages 5–7 / 8–10, grade 5–6 for 11–13.
- Tone: warm, curious. No "test" framing.`,
    },
    {
      role: "user" as const,
      content: `Wiki page (${page.kind}) — ${page.title}\n\n${truncate(page.body, 2200)}\n\nProduce the quiz JSON now.`,
    },
  ];

  const res = await ai.chat({
    messages,
    json: true,
    temperature: 0.6,
    maxTokens: 1400,
  });

  let raw: { questions?: unknown };
  try {
    raw = JSON.parse(res.text);
  } catch (e) {
    throw new Error("quiz JSON parse failed");
  }
  const list = Array.isArray(raw.questions) ? raw.questions : [];
  const questions: QuizQuestion[] = [];
  for (const q of list as Array<Record<string, unknown>>) {
    if (typeof q.prompt !== "string" || !q.prompt) continue;
    if (q.type !== "mcq" && q.type !== "free") continue;
    if (q.type === "mcq") {
      const ch = Array.isArray(q.choices) ? (q.choices as unknown[]).map(String) : [];
      const ci = typeof q.correct_index === "number" ? q.correct_index : -1;
      if (ch.length !== 4 || ci < 0 || ci > 3) continue;
      questions.push({
        prompt: q.prompt,
        type: "mcq",
        choices: ch,
        correct_index: ci,
        hint: typeof q.hint === "string" ? q.hint : undefined,
        explanation: typeof q.explanation === "string" ? q.explanation : "",
      });
    } else {
      questions.push({
        prompt: q.prompt,
        type: "free",
        hint: typeof q.hint === "string" ? q.hint : undefined,
        explanation: typeof q.explanation === "string" ? q.explanation : "",
      });
    }
    if (questions.length >= 4) break;
  }
  if (!questions.length) throw new Error("quiz produced no usable questions");

  return { pageTitle: page.title, pagePath: page.path, questions };
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

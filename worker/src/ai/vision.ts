// vision.ts
// Provider-agnostic vision analyse: accept an image + prompt, return text.
//
// Routing:
//   "@cf/..." → Cloudflare Workers AI binding (no extra key, free-tier)
//   "claude-..." → Anthropic Messages API (requires ANTHROPIC_API_KEY)
//   "gemini-..." → Google Generative Language API (requires GEMINI_API_KEY)
//
// OpenAI models stay client-side on iOS (user's own API key) — they never
// hit this module.

export type VisionEnv = {
  AI?: any;                       // CF Workers AI binding
  ANTHROPIC_API_KEY?: string;
  GEMINI_API_KEY?: string;
};

export type VisionInput = {
  model: string;
  prompt: string;
  imageBase64: string;            // raw base64, NO "data:" prefix
  mediaType?: string;             // "image/jpeg" by default
  maxTokens?: number;
};

export type VisionResult = {
  text: string;
  model: string;
  provider: "cloudflare" | "anthropic" | "gemini";
  latencyMs: number;
};

// ─── public catalog ───
//
// Each entry maps an iOS-facing model id to provider routing + display
// metadata. /api/analyze/models filters this catalog by which secrets are
// configured so the picker only shows models that will actually work.
//
// Add entries here as Cloudflare publishes new vision models — the iOS
// app reads the list dynamically.

export type ModelEntry = {
  id: string;
  label: string;
  provider: "cloudflare" | "anthropic" | "gemini";
  speed: "fast" | "medium" | "slow";
  blurb: string;             // short EN tagline for the picker
  blurb_zh?: string;
};

export const MODEL_CATALOG: ModelEntry[] = [
  // — Cloudflare Workers AI (free, no key) —
  {
    id: "@cf/meta/llama-3.2-11b-vision-instruct",
    label: "Llama 3.2 Vision (11B)",
    provider: "cloudflare",
    speed: "fast",
    blurb: "Fast, free vision model — good for quick captions.",
    blurb_zh: "快速免费视觉模型,适合快速识图。",
  },
  {
    id: "@cf/google/gemma-3-12b-it",
    label: "Gemma 3 (12B)",
    provider: "cloudflare",
    speed: "fast",
    blurb: "Multilingual, 128K context — strong at long bilingual write-ups.",
    blurb_zh: "多语种 + 128K 上下文,适合多语言长讲解。",
  },

  // — Anthropic Claude —
  {
    id: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    provider: "anthropic",
    speed: "fast",
    blurb: "Fast, good at long bilingual narration.",
    blurb_zh: "速度快,擅长长讲解,中文叙述自然。",
  },
  {
    id: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    provider: "anthropic",
    speed: "medium",
    blurb: "Stronger detail recognition — inscriptions, dates, art styles.",
    blurb_zh: "细节识别更扎实(碑文/年代/艺术流派)。",
  },

  // — Google Gemini —
  {
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    provider: "gemini",
    speed: "fast",
    blurb: "Lowest latency, multilingual.",
    blurb_zh: "延迟最低,多语种讲解流畅。",
  },
];

/** Filter to models whose required secret is present. */
export function availableModels(env: VisionEnv): ModelEntry[] {
  return MODEL_CATALOG.filter((m) => {
    if (m.provider === "cloudflare") return !!env.AI;
    if (m.provider === "anthropic") return !!env.ANTHROPIC_API_KEY;
    if (m.provider === "gemini") return !!env.GEMINI_API_KEY;
    return false;
  });
}

// ─── dispatch ───

export async function analyseImage(env: VisionEnv, input: VisionInput): Promise<VisionResult> {
  const start = Date.now();
  const mediaType = input.mediaType || "image/jpeg";

  const model = MODEL_CATALOG.find((m) => m.id === input.model);
  if (!model) throw new Error(`Unknown model: ${input.model}`);

  let text: string;
  switch (model.provider) {
    case "cloudflare":
      text = await callCloudflare(env, input, mediaType);
      break;
    case "anthropic":
      text = await callAnthropic(env, input, mediaType);
      break;
    case "gemini":
      text = await callGemini(env, input, mediaType);
      break;
  }

  return {
    text,
    model: input.model,
    provider: model.provider,
    latencyMs: Date.now() - start,
  };
}

// ─── Cloudflare Workers AI ───

async function callCloudflare(env: VisionEnv, input: VisionInput, _mediaType: string): Promise<string> {
  if (!env.AI) throw new Error("Cloudflare AI binding not available");

  // Llama 3.2 Vision uses the array-of-bytes input format; Gemma 3 uses
  // chat-style messages with image_url. Branch by model id.
  if (input.model.includes("llama-3.2") && input.model.includes("vision")) {
    const bytes = base64ToBytes(input.imageBase64);
    const res = await env.AI.run(input.model, {
      image: Array.from(bytes),
      prompt: input.prompt,
      max_tokens: input.maxTokens ?? 2000,
    });
    return extractCfText(res);
  }

  // Gemma 3 / chat-style multimodal: messages with content blocks.
  const dataUrl = `data:image/jpeg;base64,${input.imageBase64}`;
  const res = await env.AI.run(input.model, {
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: input.prompt },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
    max_tokens: input.maxTokens ?? 2000,
  });
  return extractCfText(res);
}

function extractCfText(res: any): string {
  if (typeof res === "string") return res;
  if (typeof res?.response === "string") return res.response;
  if (typeof res?.result?.response === "string") return res.result.response;
  if (Array.isArray(res?.choices) && res.choices[0]?.message?.content) {
    return String(res.choices[0].message.content);
  }
  return JSON.stringify(res).slice(0, 2000);
}

// ─── Anthropic ───

async function callAnthropic(env: VisionEnv, input: VisionInput, mediaType: string): Promise<string> {
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      max_tokens: input.maxTokens ?? 2000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: input.imageBase64 },
            },
            { type: "text", text: input.prompt },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Anthropic ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const block = (json.content || []).find((b) => b.type === "text");
  return block?.text ?? "";
}

// ─── Google Gemini ───

async function callGemini(env: VisionEnv, input: VisionInput, mediaType: string): Promise<string> {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:generateContent?key=${env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: input.prompt },
            { inline_data: { mime_type: mediaType, data: input.imageBase64 } },
          ],
        },
      ],
      generationConfig: { maxOutputTokens: input.maxTokens ?? 2000 },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini ${res.status}: ${body.slice(0, 300)}`);
  }
  type GeminiResp = { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const json = (await res.json()) as GeminiResp;
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p) => p.text ?? "").join("");
}

// ─── helpers ───

function base64ToBytes(b64: string): Uint8Array {
  // Strip any data: prefix defensively
  const idx = b64.indexOf(",");
  const raw = idx >= 0 ? b64.slice(idx + 1) : b64;
  const bin = atob(raw);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

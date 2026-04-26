import type { AiProvider, ChatOpts, ChatResult } from "./provider";
import { AiError } from "./provider";

const ENDPOINT = "https://api.deepseek.com/v1/chat/completions";
const DEFAULT_MODEL = "deepseek-chat";

export class DeepSeekProvider implements AiProvider {
  readonly name = "deepseek";
  constructor(private apiKey: string, private defaultModel = DEFAULT_MODEL) {
    if (!apiKey) throw new AiError("DEEPSEEK_API_KEY missing");
  }

  async chat(opts: ChatOpts): Promise<ChatResult> {
    const model = opts.model || this.defaultModel;
    const body: Record<string, unknown> = {
      model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.4,
      max_tokens: opts.maxTokens ?? 2048,
    };
    if (opts.json) body.response_format = { type: "json_object" };

    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new AiError(`network: ${String(e)}`, { retriable: true });
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new AiError(`deepseek ${res.status}: ${text.slice(0, 400)}`, {
        status: res.status,
        retriable: res.status >= 500 || res.status === 429,
      });
    }

    const data = (await res.json()) as DeepSeekResponse;
    const choice = data.choices?.[0];
    const text = choice?.message?.content ?? "";
    return {
      text,
      model: data.model ?? model,
      finishReason: choice?.finish_reason,
      usage: data.usage && {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      },
    };
  }
}

type DeepSeekResponse = {
  model?: string;
  choices?: Array<{
    message?: { role: string; content: string };
    finish_reason?: string;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
};

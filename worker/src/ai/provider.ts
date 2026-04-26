// AI provider abstraction. Implementations live alongside (deepseek.ts,
// workersai.ts, …) and are selected by env var AI_PROVIDER.

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string };

export type ChatOpts = {
  messages: ChatMessage[];
  model?: string;
  json?: boolean;        // request strict JSON output where supported
  maxTokens?: number;
  temperature?: number;
};

export type ChatResult = {
  text: string;          // raw text returned by the model
  model: string;         // resolved model name
  finishReason?: string;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
};

export interface AiProvider {
  readonly name: string;
  chat(opts: ChatOpts): Promise<ChatResult>;
}

export class AiError extends Error {
  status?: number;
  retriable: boolean;
  constructor(msg: string, opts: { status?: number; retriable?: boolean } = {}) {
    super(msg);
    this.status = opts.status;
    this.retriable = opts.retriable ?? false;
  }
}

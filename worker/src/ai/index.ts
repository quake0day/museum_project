import type { AiProvider } from "./provider";
import { DeepSeekProvider } from "./deepseek";
import { AiError } from "./provider";

export type AiEnv = {
  AI_PROVIDER?: string;
  AI_MODEL_CHAT?: string;
  DEEPSEEK_API_KEY?: string;
};

export function getAiProvider(env: AiEnv): AiProvider {
  const name = (env.AI_PROVIDER || "deepseek").toLowerCase();
  switch (name) {
    case "deepseek":
      return new DeepSeekProvider(env.DEEPSEEK_API_KEY ?? "", env.AI_MODEL_CHAT);
    default:
      throw new AiError(`unknown AI_PROVIDER: ${name}`);
  }
}

export type { AiProvider, ChatOpts, ChatResult } from "./provider";
export { AiError } from "./provider";

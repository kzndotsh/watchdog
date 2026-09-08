import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

import type { LlmProviderConfig } from "./llm-provider";
import { llmProviderConfigSchema } from "./llm-provider";

/** Resolve a LanguageModel from vault-shaped config (no Graph/DB). */
export function createWatchdogModel(config: LlmProviderConfig): LanguageModel {
  const parsed = llmProviderConfigSchema.parse(config);
  switch (parsed.kind) {
    case "anthropic": {
      const anthropic = createAnthropic({ apiKey: parsed.apiKey });
      return anthropic(parsed.model);
    }
    case "openai_compat": {
      const openai = createOpenAICompatible({
        name: "watchdog-compat",
        apiKey: parsed.apiKey,
        baseURL: parsed.baseUrl,
      });
      return openai(parsed.model);
    }
    default: {
      const _exhaustive: never = parsed;
      return _exhaustive;
    }
  }
}

import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

import type { LlmProviderConfig } from "./llm-provider";
import { llmProviderConfigSchema } from "./llm-provider";

/**
 * The `fetch` the provider sends every request with. A Job passes the one its `Egress` handed
 * out for the provider's origin (`Egress.llmFetchFor`), so the call is admitted, recorded and
 * limited there; absent, the SDK uses the runtime's own `fetch`.
 */
export type ModelFetch = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

/** Resolve a LanguageModel from vault-shaped config (no Graph/DB). */
export function createWatchdogModel(
  config: LlmProviderConfig,
  options?: { readonly fetch?: ModelFetch }
): LanguageModel {
  const parsed = llmProviderConfigSchema.parse(config);
  const fetch = options?.fetch;
  switch (parsed.kind) {
    case "anthropic": {
      const anthropic = createAnthropic({
        apiKey: parsed.apiKey,
        ...(fetch === undefined ? {} : { fetch }),
      });
      return anthropic(parsed.model);
    }
    case "openai_compat": {
      const openai = createOpenAICompatible({
        name: "watchdog-compat",
        apiKey: parsed.apiKey,
        baseURL: parsed.baseUrl,
        ...(fetch === undefined ? {} : { fetch }),
      });
      return openai(parsed.model);
    }
    default: {
      const _exhaustive: never = parsed;
      return _exhaustive;
    }
  }
}

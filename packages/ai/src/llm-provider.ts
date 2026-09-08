import { z } from "zod";

import { httpUrlSchema, nonEmptyTrimmed } from "@watchdog/schemas";

/** Vault-shaped provider config — never env soup in Cap bodies. */
export const llmProviderConfigSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("anthropic"),
    apiKey: nonEmptyTrimmed,
    model: nonEmptyTrimmed,
  }),
  z.object({
    kind: z.literal("openai_compat"),
    baseUrl: httpUrlSchema,
    apiKey: nonEmptyTrimmed,
    model: nonEmptyTrimmed,
  }),
]);

export type LlmProviderConfig = z.infer<typeof llmProviderConfigSchema>;

import { z } from "zod";

import {
  NAME_MAX,
  SECRET_MAX,
  httpUrlSchema,
  requiredText,
} from "@watchdog/schemas/shared";

/** Vault-shaped provider config — never env soup in Cap bodies. */
export const llmProviderConfigSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("anthropic"),
    apiKey: requiredText(SECRET_MAX),
    model: requiredText(NAME_MAX),
  }),
  z.object({
    kind: z.literal("openai_compat"),
    baseUrl: httpUrlSchema,
    apiKey: requiredText(SECRET_MAX),
    model: requiredText(NAME_MAX),
  }),
]);

export type LlmProviderConfig = z.infer<typeof llmProviderConfigSchema>;

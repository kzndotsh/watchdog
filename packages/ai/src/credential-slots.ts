/**
 * The Vault slots a model call reads, as Settings shows them. The AI side owns them: a Cap that
 * calls a model (`extract.ai`) lists them in its `credentials`, and Settings' catalog derives
 * from there. Plain data (the shape of the Cap SDK's `CredentialSlotMeta`) so this package does
 * not depend on `@watchdog/caps`.
 */
export type LlmCredentialSlot = {
  name: string;
  label: string;
  description: string;
  secret?: boolean;
};

export const ANTHROPIC_API_KEY_SLOT = {
  name: "ANTHROPIC_API_KEY",
  label: "Anthropic",
  description: "Anthropic API key.",
} as const satisfies LlmCredentialSlot;

export const AI_COMPAT_API_KEY_SLOT = {
  name: "AI_COMPAT_API_KEY",
  label: "OpenAI-compatible",
  description: "API key for OpenAI-compatible providers.",
} as const satisfies LlmCredentialSlot;

export const AI_COMPAT_BASE_URL_SLOT = {
  name: "AI_COMPAT_BASE_URL",
  label: "OpenAI-compatible URL",
  description: "Base URL for OpenAI-compatible providers.",
  secret: false,
} as const satisfies LlmCredentialSlot;

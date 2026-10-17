import { z } from "zod";

import { entitySlugScopeInputSchema } from "./graph-scope";

/**
 * Settings an organization owner or admin controls. Every flag has a default,
 * so an organization with no stored row behaves as the defaults say.
 */
export const organizationSettingsSchema = z.object({
  /** Whether a Dossier may hand its Markdown to an external AI chat. Default on. */
  externalAiHandoff: z.boolean(),
});
export type OrganizationSettings = z.output<typeof organizationSettingsSchema>;

export const DEFAULT_ORGANIZATION_SETTINGS: OrganizationSettings = {
  externalAiHandoff: true,
};

export const updateOrganizationSettingsInputSchema = z.object({
  externalAiHandoff: z.boolean(),
});
export type UpdateOrganizationSettingsInput = z.output<
  typeof updateOrganizationSettingsInputSchema
>;

/** The external AI chats a Dossier can be handed to. */
export const AI_HANDOFF_DESTINATIONS = ["claude", "chatgpt"] as const;
export type AiHandoffDestination = (typeof AI_HANDOFF_DESTINATIONS)[number];
export const aiHandoffDestinationSchema = z.enum(AI_HANDOFF_DESTINATIONS);

export const AI_HANDOFF_DESTINATION_LABELS: Record<
  AiHandoffDestination,
  string
> = {
  claude: "Claude",
  chatgpt: "ChatGPT",
};

/** Record that an Entity's Markdown is about to leave for an external AI (never the text). */
export const recordAiHandoffInputSchema = entitySlugScopeInputSchema.extend({
  destination: aiHandoffDestinationSchema,
});
export type RecordAiHandoffInput = z.output<typeof recordAiHandoffInputSchema>;

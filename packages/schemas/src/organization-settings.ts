import { z } from "zod";

import { entitySlugScopeInputSchema } from "./graph-scope";

/**
 * Settings an organization owner or admin controls. Every flag has a default,
 * so an organization with no stored row behaves as the defaults say.
 */
export const organizationSettingsSchema = z.object({
  /** Whether a Dossier may hand its Markdown to an external AI chat. Default on. */
  openInExternalTools: z.boolean(),
});
export type OrganizationSettings = z.output<typeof organizationSettingsSchema>;

export const DEFAULT_ORGANIZATION_SETTINGS: OrganizationSettings = {
  openInExternalTools: true,
};

export const updateOrganizationSettingsInputSchema = z.object({
  openInExternalTools: z.boolean(),
});
export type UpdateOrganizationSettingsInput = z.output<
  typeof updateOrganizationSettingsInputSchema
>;

/** The external AI chats a Dossier can be handed to. */
export const OPEN_IN_DESTINATIONS = ["claude", "chatgpt"] as const;
export type OpenInDestination = (typeof OPEN_IN_DESTINATIONS)[number];
export const openInDestinationSchema = z.enum(OPEN_IN_DESTINATIONS);

export const OPEN_IN_DESTINATION_LABELS: Record<OpenInDestination, string> = {
  claude: "Claude",
  chatgpt: "ChatGPT",
};

/** Record that an Entity's Markdown is about to leave for an external AI (never the text). */
export const recordOpenInInputSchema = entitySlugScopeInputSchema.extend({
  destination: openInDestinationSchema,
});
export type RecordOpenInInput = z.output<typeof recordOpenInInputSchema>;

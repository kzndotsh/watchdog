import { boolean, pgTable, text } from "drizzle-orm/pg-core";

import type { OrganizationId } from "@watchdog/schemas/shared";

import { timestamps } from "./_helpers";
import { organization } from "./auth";

/**
 * Per-organization switches an owner or admin controls. One row per
 * organization, written on the first change: an organization with no row has the
 * defaults (`DEFAULT_ORGANIZATION_SETTINGS` in `@watchdog/schemas/shared`). The
 * row goes with the organization (`on delete cascade`).
 */
export const organizationSettings = pgTable("organization_settings", {
  organizationId: text("organization_id")
    .$type<OrganizationId>()
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  /** Whether a Dossier may be handed to an external AI chat. */
  openInExternalTools: boolean("open_in_external_tools")
    .notNull()
    .default(true),
  ...timestamps,
});

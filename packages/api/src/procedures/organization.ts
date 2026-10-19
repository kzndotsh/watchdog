import {
  getOrganizationSettingsEffect,
  updateOrganizationSettingsEffect,
} from "@watchdog/core/organization";
import {
  organizationSettingsSchema,
  updateOrganizationSettingsInputSchema,
} from "@watchdog/schemas/shared";

import { authed } from "../os";
import { runApp } from "../runtime";

export const getSettings = authed
  .meta({ scope: "cases:read" })
  .route({
    method: "GET",
    path: "/organization/settings",
    summary: "Get the organization's settings",
    tags: ["organization"],
  })
  .output(organizationSettingsSchema)
  .handler(async ({ context }) =>
    runApp(getOrganizationSettingsEffect(context.actor.organizationId))
  );

export const updateSettings = authed
  .meta({ scope: "graph:write" })
  .route({
    method: "PATCH",
    path: "/organization/settings",
    summary: "Change the organization's settings (owner or admin only)",
    tags: ["organization"],
  })
  .input(updateOrganizationSettingsInputSchema)
  .output(organizationSettingsSchema)
  .handler(async ({ input, context }) =>
    runApp(
      updateOrganizationSettingsEffect({
        ...input,
        organizationId: context.actor.organizationId,
        actorId: context.actor.userId,
      })
    )
  );

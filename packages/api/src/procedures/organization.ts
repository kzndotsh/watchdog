import {
  getJobStartLimitsEffect,
  getOrganizationSettingsEffect,
  setJobStartLimitEffect,
  updateOrganizationSettingsEffect,
} from "@watchdog/core/organization";
import {
  jobStartLimitsSchema,
  organizationSettingsSchema,
  setJobStartLimitInputSchema,
  updateOrganizationSettingsInputSchema,
} from "@watchdog/schemas/shared";

import { actorKeyIdFromContext } from "../actor-label";
import { authed, sessionAuthed } from "../os";
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

export const updateSettings = sessionAuthed
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

export const getJobStartLimits = authed
  .meta({ scope: "cases:read" })
  .route({
    method: "GET",
    path: "/organization/job-limits",
    summary:
      "Get the Job start limits that apply to the caller: the organization's, the calling key's, and this window's use",
    tags: ["organization"],
  })
  .output(jobStartLimitsSchema)
  .handler(async ({ context }) =>
    runApp(
      getJobStartLimitsEffect({
        organizationId: context.actor.organizationId,
        actorKeyId: actorKeyIdFromContext(context),
      })
    )
  );

export const setJobStartLimit = sessionAuthed
  .route({
    method: "PUT",
    path: "/organization/job-limits",
    summary:
      "Set or clear a Job start limit for the organization or one of its API keys (owner or admin; raising the organization's above the instance default needs an instance admin)",
    tags: ["organization"],
  })
  .input(setJobStartLimitInputSchema)
  .output(jobStartLimitsSchema)
  .handler(async ({ input, context }) =>
    runApp(
      setJobStartLimitEffect({
        organizationId: context.actor.organizationId,
        actorId: context.actor.userId,
        keyId: input.keyId,
        maxStarts: input.maxStarts,
      })
    )
  );

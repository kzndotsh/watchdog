import { Effect } from "effect";

import { organizationSettingsRepo } from "@watchdog/db";
import {
  DEFAULT_ORGANIZATION_SETTINGS,
  type OrganizationSettings,
  type OrganizationId,
  type UpdateOrganizationSettingsInput,
} from "@watchdog/schemas/shared";

import type { Db } from "../infra/db-service";
import { tryDbWith, requireWritten } from "../infra/postgres-effect";
import type { DomainTag } from "../infra/tagged-errors";
import { requireOrganizationManagerEffect } from "./roles";

/** The organization's settings; the defaults when it never changed one. */
export function getOrganizationSettingsEffect(
  organizationId: OrganizationId
): Effect.Effect<OrganizationSettings, DomainTag, Db> {
  return Effect.gen(function* getOrganizationSettingsGen() {
    const row = yield* tryDbWith((exec) =>
      organizationSettingsRepo.get(exec, organizationId)
    );
    return row === undefined
      ? DEFAULT_ORGANIZATION_SETTINGS
      : { externalAiHandoff: row.externalAiHandoff };
  });
}

export type UpdateOrganizationSettingsOpts = UpdateOrganizationSettingsInput & {
  organizationId: OrganizationId;
  /** The caller; only an owner or admin of the organization may change settings. */
  actorId: string;
};

/** Change the organization's settings. A member, or a user outside the organization, is `forbidden`. */
export function updateOrganizationSettingsEffect(
  opts: UpdateOrganizationSettingsOpts
): Effect.Effect<OrganizationSettings, DomainTag, Db> {
  return Effect.gen(function* updateOrganizationSettingsGen() {
    yield* requireOrganizationManagerEffect({
      organizationId: opts.organizationId,
      actorId: opts.actorId,
      reason: "Only an owner or admin can change organization settings",
    });
    const row = yield* tryDbWith((exec) =>
      organizationSettingsRepo.upsert(exec, opts.organizationId, {
        externalAiHandoff: opts.externalAiHandoff,
      })
    ).pipe(requireWritten("update organization settings"));
    return { externalAiHandoff: row.externalAiHandoff };
  });
}

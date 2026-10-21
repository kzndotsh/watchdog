import { Effect } from "effect";

import {
  DEFAULT_ORGANIZATION_SETTINGS,
  type AiHandoffDestination,
  type CaseId,
  type OrganizationId,
} from "@watchdog/schemas/shared";

import { appendActivityEffect } from "../activity/append";
import { optionalActorId } from "../actors/require-actor-id";
import { getEntityByCaseSlugEffect } from "../graph/entities";
import type { Db } from "../infra/db-service";
import { transact } from "../infra/postgres-tx";
import { organizationSettingsRepoFx } from "../infra/repos-fx";
import { ForbiddenError, type DomainTag } from "../infra/tagged-errors";

export type RecordAiHandoffOpts = {
  caseId: CaseId;
  organizationId: OrganizationId;
  slug: string;
  destination: AiHandoffDestination;
  actorId?: string;
  /** API-key display snapshot (`api-key:...`), never a user name. */
  actorLabel?: string;
};

/**
 * Record that an Entity's Markdown is being handed to an external AI chat, as
 * one activity entry in the same transaction that checks the organization still
 * allows it. The entry names the actor, the Entity (`subject_id`, `label`) and
 * the destination (`to_value`); the Markdown never reaches the server, so it
 * cannot be logged. A foreign or missing Case or Entity is `not_found`; an
 * organization that turned the handoff off gets `forbidden`.
 */
export function recordAiHandoffEffect(
  opts: RecordAiHandoffOpts
): Effect.Effect<void, DomainTag, Db> {
  return Effect.gen(function* recordAiHandoffGen() {
    const entity = yield* getEntityByCaseSlugEffect(
      opts.caseId,
      opts.organizationId,
      opts.slug
    );
    yield* transact((tx) =>
      Effect.gen(function* recordAiHandoffTx() {
        const stored = yield* organizationSettingsRepoFx.get(
          tx,
          opts.organizationId
        );
        const allowed =
          stored?.externalAiHandoff ??
          DEFAULT_ORGANIZATION_SETTINGS.externalAiHandoff;
        if (!allowed) {
          return yield* new ForbiddenError({
            reason: "External AI handoff is turned off for this organization",
          });
        }
        yield* appendActivityEffect(tx, {
          caseId: opts.caseId,
          kind: "handoff",
          action: "opened",
          subjectId: entity.id,
          label: entity.name,
          toValue: opts.destination,
          actorId: optionalActorId(opts.actorId),
          actorLabel: opts.actorLabel,
        });
      })
    );
  });
}

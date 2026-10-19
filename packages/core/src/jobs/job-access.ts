import { Effect } from "effect";

import {
  apiKeyStatus,
  isUserBanned,
  resolveUserOrganizationId,
  type JobRow,
} from "@watchdog/db";
import type { OrganizationId } from "@watchdog/schemas/shared";

import { nowDateEffect } from "../infra/clock";
import type { Db } from "../infra/db-service";
import { tryDbWith } from "../infra/postgres-effect";
import type { DomainTag } from "../infra/tagged-errors";

/** Cancellation reasons, stored in the cancelled Job's `error`. */
const KEY_LOSS_REASON = {
  missing: "Cancelled: the API key that started this Job no longer exists",
  disabled: "Cancelled: the API key that started this Job was disabled",
  expired: "Cancelled: the API key that started this Job has expired",
} as const;

const CREATOR_LEFT_ORGANIZATION_REASON =
  "Cancelled: the creator of this Job is no longer a member of the organization";
const CREATOR_BANNED_REASON = "Cancelled: the creator of this Job is banned";

/**
 * Background work stops when its author loses access. Returns the cancellation reason when the
 * Job's creator is no longer a member of the Case's organization, is banned, or (for a Job an
 * API key started) the key is gone, disabled or expired; `null` when the Job may run. A session
 * Job never consults the key table.
 */
export function jobAccessLostReasonEffect(
  job: Pick<JobRow, "actorId" | "actorKeyId">,
  organizationId: OrganizationId
): Effect.Effect<string | null, DomainTag, Db> {
  return Effect.gen(function* jobAccessLostReasonGen() {
    const memberOf = yield* tryDbWith((exec) =>
      resolveUserOrganizationId(exec, job.actorId, organizationId)
    );
    if (memberOf === null) return CREATOR_LEFT_ORGANIZATION_REASON;

    const now = yield* nowDateEffect;
    const banned = yield* tryDbWith((exec) =>
      isUserBanned(exec, job.actorId, now)
    );
    if (banned) return CREATOR_BANNED_REASON;

    const { actorKeyId } = job;
    if (actorKeyId === null) return null;
    const status = yield* tryDbWith((exec) =>
      apiKeyStatus(exec, actorKeyId, job.actorId, now)
    );
    return status === "usable" ? null : KEY_LOSS_REASON[status];
  });
}

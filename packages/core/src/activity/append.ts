import { Effect } from "effect";

import { activityLogRepo, type ActivityRow, type DbExec } from "@watchdog/db";
import {
  ACTIVITY_LABEL_MAX,
  formatActivityCursor,
  isActivityActionForKind,
  type ActivityEntry,
  type ActivityEntryKind,
} from "@watchdog/schemas/feed";
import type { CaseId } from "@watchdog/schemas/shared";

import { actorLabelForPersist } from "../actors/actor-label-snapshot";
import { tryDb } from "../infra/postgres-effect";
import { InternalError, type DomainTag } from "../infra/tagged-errors";

export interface ActivityAppendInput {
  caseId: CaseId;
  kind: ActivityEntryKind;
  /** A verb from `ACTIVITY_ENTRY_ACTIONS[kind]`. */
  action: string;
  subjectId?: string | null;
  groupId?: string | null;
  /** Display snapshot, cut to 200 characters. Never a body, patch or secret. */
  label?: string | null;
  actorId?: string | null;
  actorLabel?: string | null;
  fromValue?: string | null;
  toValue?: string | null;
}

/** Wire shape of a stored row (the SSE `activity` event, the replay response). */
export function toActivityEntry(row: ActivityRow): ActivityEntry {
  return {
    cursor: formatActivityCursor({ xid: row.xid, id: row.id }),
    id: row.id,
    caseId: row.caseId,
    kind: row.kind,
    action: row.action,
    subjectId: row.subjectId,
    groupId: row.groupId,
    label: row.label,
    actorId: row.actorId,
    actorLabel: row.actorLabel,
    fromValue: row.fromValue,
    toValue: row.toValue,
    at: row.createdAt.toISOString(),
  };
}

/**
 * The only writer of the activity log (ADR-0005 decision 2). Call it with the
 * domain transaction's `tx`, inside the `transact` body that makes the change:
 * a rolled-back write then leaves no entry, and the `AFTER INSERT` trigger's
 * NOTIFY is dropped with it. Never call it on the pool for a change that
 * committed separately.
 *
 * An unlisted `(kind, action)` pair, or a write that returns no row, is a bug
 * in server code, so it is an `InternalError`, not caller input.
 */
export function appendActivityEffect(
  tx: DbExec,
  input: ActivityAppendInput
): Effect.Effect<ActivityEntry, DomainTag> {
  return Effect.gen(function* appendActivityGen() {
    if (!isActivityActionForKind(input.kind, input.action)) {
      return yield* new InternalError({
        reason: `Unknown activity action ${input.kind}.${input.action}`,
      });
    }
    const label = input.label?.slice(0, ACTIVITY_LABEL_MAX) ?? null;
    const row = yield* tryDb(() =>
      activityLogRepo.append(tx, {
        ...input,
        label,
        actorLabel: actorLabelForPersist(input.actorLabel),
      })
    );
    if (row === null) {
      return yield* new InternalError({
        reason: "Failed to append activity entry",
      });
    }
    return toActivityEntry(row);
  });
}

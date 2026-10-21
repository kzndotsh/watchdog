import { Effect } from "effect";

import type { CasePurgeCounts, DbExec } from "@watchdog/db";
import type {
  CaseDeletionEvent,
  CaseId,
  OrganizationId,
} from "@watchdog/schemas/shared";

import { appendGraphActivityEffect } from "../graph/graph-activity";
import { requireWritten } from "../infra/postgres-effect";
import { caseDeletionRecordsRepoFx } from "../infra/repos-fx";
import type { DomainTag } from "../infra/tagged-errors";

/** The Case a lifecycle event is about, as it reads at that moment. */
export type DeletionSubject = {
  id: CaseId;
  organizationId: OrganizationId;
  name: string;
  slug: string;
};

/** Who did it: the user (an API key's user) and the key snapshot; neither is the scheduled purge. */
export type DeletionActor = {
  actorId: string | null;
  actorLabel: string | null;
  /** The API key; goes on the activity entry only (the deletion record keeps the label). */
  actorKeyId?: string | null;
};

/**
 * The one writer of a Case lifecycle event, called in the transaction that changes the Case and
 * BEFORE the change: the permanent `case_deletion_records` row the database demands
 * (`cases_lifecycle_guard` refuses the change without the matching record of this transaction),
 * and for `deleted` and `restored` the Case-level activity entry that tells other open sessions
 * (`kind case`, the Case itself as the subject).
 */
export function recordDeletionEventEffect(
  tx: DbExec,
  subject: DeletionSubject,
  event: CaseDeletionEvent,
  actor: DeletionActor,
  counts?: CasePurgeCounts
): Effect.Effect<void, DomainTag> {
  return Effect.gen(function* recordDeletionEventGen() {
    yield* caseDeletionRecordsRepoFx
      .append(tx, {
        caseId: subject.id,
        organizationId: subject.organizationId,
        caseName: subject.name,
        caseSlug: subject.slug,
        event,
        actorId: actor.actorId,
        actorLabel: actor.actorLabel,
        ...(counts === undefined ? {} : { counts }),
      })
      .pipe(requireWritten(`record Case ${event}`));
    if (event === "deleted" || event === "restored") {
      yield* appendGraphActivityEffect(tx, {
        caseId: subject.id,
        kind: "case",
        action: event,
        subjectId: subject.id,
        label: subject.name,
        actorId: actor.actorId,
        actorLabel: actor.actorLabel,
        actorKeyId: actor.actorKeyId ?? null,
      });
    }
  });
}

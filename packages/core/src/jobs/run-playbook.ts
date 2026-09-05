import { Effect } from "effect";

import {
  checkPlaybookAvailability,
  formatPlanError,
  requireCapability,
  requirePlaybook,
  planPlaybook,
  playbookCapabilityIds,
  seedValuesToJson,
  toPlaybookDescriptor,
  type SeedValues,
} from "@watchdog/caps";
import { casesRepo, db, jobsRepo, playbookRunsRepo } from "@watchdog/db";

import {
  assertCaseInOrgEffect,
  assertEntityInCaseEffect,
  assertEvidenceInCaseEffect,
} from "../graph/patch/guards";
import { errorMessage } from "../infra/domain-error";
import { tryDb } from "../infra/postgres-effect";
import { transact } from "../infra/postgres-tx";
import { logProcess } from "../infra/process-log";
import {
  ConflictError,
  ForbiddenError,
  InvalidError,
  NotFoundError,
  type DomainTag,
} from "../infra/tagged-errors";
import { hasCredentialEffect } from "../infra/vault";
import { enqueueCapJobEffect } from "./boss";
import { toJobRecord, type JobRecord } from "./start-job";

export interface RunPlaybookInput {
  caseId: string;
  organizationId: string;
  playbookId: string;
  actorId: string;
  actorLabel?: string | null;
  seed: SeedValues;
}

export interface PlaybookRunResult {
  playbookId: string;
  playbookRunId: string;
  jobs: JobRecord[];
}

function loadPlaybookEffect(playbookId: string) {
  return Effect.try({
    try: () => requirePlaybook(playbookId),
    catch: (error) => new NotFoundError({ resource: errorMessage(error) }),
  });
}

function assertSeedAnchorsInCaseEffect(
  caseId: string,
  seed: SeedValues
): Effect.Effect<void, DomainTag> {
  return Effect.gen(function* assertSeedAnchorsInCaseGen() {
    if (seed.entityId !== undefined && seed.entityId !== "") {
      yield* assertEntityInCaseEffect(caseId, seed.entityId);
    }
    if (seed.evidenceId !== undefined && seed.evidenceId !== "") {
      yield* assertEvidenceInCaseEffect(caseId, seed.evidenceId);
    }
  });
}

function credentialNamesFromDescriptor(
  descriptor: ReturnType<typeof toPlaybookDescriptor>
): Set<string> {
  const credNames = new Set<string>();
  for (const spec of descriptor.requires.credentials) {
    if ("anyOf" in spec) for (const n of spec.anyOf) credNames.add(n);
    else credNames.add(spec.name);
  }
  return credNames;
}

function presentCredentialNamesEffect(
  actorId: string,
  credNames: Iterable<string>
): Effect.Effect<Set<string>, DomainTag> {
  const present = new Set<string>();
  return Effect.forEach(
    [...credNames],
    (name) =>
      hasCredentialEffect(actorId, name).pipe(
        Effect.tap((ok) =>
          Effect.sync(() => {
            if (ok) present.add(name);
          })
        )
      ),
    { concurrency: "unbounded" }
  ).pipe(Effect.map(() => present));
}

function thirdPartyCapabilityId(playbook: ReturnType<typeof requirePlaybook>) {
  return playbookCapabilityIds(playbook).find(
    (id) => (requireCapability(id).egress ?? "none") === "third_party"
  );
}

function ensurePlaybookRunnable(
  descriptor: ReturnType<typeof toPlaybookDescriptor>,
  present: Set<string>,
  allowThirdPartyEgress: boolean,
  playbook: ReturnType<typeof requirePlaybook>
): Effect.Effect<void, DomainTag> {
  const availability = checkPlaybookAvailability(descriptor.requires, {
    hasCredential: (name) => present.has(name),
    allowThirdPartyEgress,
    thirdPartyCapabilityId: thirdPartyCapabilityId(playbook),
  });
  if (availability.ok) return Effect.void;
  if (availability.kind === "egress_blocked") {
    return new ForbiddenError({
      reason: `Case does not permit third-party egress — enable it in Case settings before running ${availability.capabilityId}`,
    });
  }
  return new ForbiddenError({
    reason: `Missing credential — set one of ${availability.names.join(" | ")} in Settings before running this playbook`,
  });
}

/** Plan → insert run + step-0 Job → enqueue. */
export function runPlaybookEffect(
  input: RunPlaybookInput
): Effect.Effect<PlaybookRunResult, DomainTag> {
  return Effect.gen(function* runPlaybookGen() {
    yield* assertCaseInOrgEffect(input.caseId, input.organizationId);
    const playbook = yield* loadPlaybookEffect(input.playbookId);
    const { seed } = input;

    yield* assertSeedAnchorsInCaseEffect(input.caseId, seed);

    const plan = planPlaybook(playbook, seed);
    if ("kind" in plan) {
      return yield* new InvalidError({ reason: formatPlanError(plan) });
    }

    const descriptor = toPlaybookDescriptor(playbook);
    const present = yield* presentCredentialNamesEffect(
      input.actorId,
      credentialNamesFromDescriptor(descriptor)
    );

    const caseRow = yield* tryDb(() =>
      casesRepo.getById(db, input.caseId, input.organizationId)
    );
    yield* ensurePlaybookRunnable(
      descriptor,
      present,
      caseRow?.allowThirdPartyEgress ?? false,
      playbook
    );

    const seedJson = seedValuesToJson(seed);

    const result = yield* transact((tx) =>
      Effect.gen(function* runPlaybookTx() {
        const run = yield* tryDb(() =>
          playbookRunsRepo.create(tx, {
            caseId: input.caseId,
            playbookId: playbook.id,
            seed: seedJson,
            status: "running",
            actorId: input.actorId,
            actorLabel: input.actorLabel ?? null,
          })
        );
        if (!run) {
          return yield* new InvalidError({
            reason: "Failed to create playbook run",
          });
        }

        const row = yield* tryDb(() =>
          jobsRepo.create(tx, {
            caseId: input.caseId,
            capabilityId: plan.step.capabilityId,
            input: plan.step.input,
            status: "queued",
            actorId: input.actorId,
            actorLabel: input.actorLabel ?? null,
            logs: [],
            playbookRunId: run.id,
            playbookStep: plan.step.playbookStep,
            playbookFanIndex: 0,
          })
        );
        if (!row) {
          return yield* new InvalidError({
            reason: `Failed to create Job for step ${plan.step.playbookStep}`,
          });
        }

        return { run, jobRows: [row] };
      })
    );

    yield* Effect.forEach(
      result.jobRows.filter((row) => row.status === "queued"),
      (row) => enqueueCapJobEffect(row.id, row.capabilityId),
      { concurrency: "unbounded" }
    );

    return {
      playbookId: playbook.id,
      playbookRunId: result.run.id,
      jobs: result.jobRows.map((row) =>
        toJobRecord(row, playbook.id, result.run.status)
      ),
    };
  });
}

interface CancelPlaybookRunOpts {
  actorId?: string;
}

interface CancelPlaybookRunResult {
  playbookRunId: string;
  cancelledJobIds: string[];
}

export function cancelPlaybookRunEffect(
  caseId: string,
  organizationId: string,
  playbookRunId: string,
  opts?: CancelPlaybookRunOpts
): Effect.Effect<CancelPlaybookRunResult, DomainTag> {
  return Effect.gen(function* cancelPlaybookRunGen() {
    yield* assertCaseInOrgEffect(caseId, organizationId);
    const now = new Date();
    const result = yield* transact((tx) =>
      Effect.gen(function* cancelPlaybookTx() {
        const run = yield* tryDb(() =>
          playbookRunsRepo.lock(tx, playbookRunId)
        );
        if (!run || run.caseId !== caseId) {
          return yield* new NotFoundError({
            resource: "Playbook run not found",
          });
        }
        if (run.status !== "running") {
          return yield* new ConflictError({
            reason: "Only running playbook runs can be cancelled",
          });
        }

        yield* tryDb(() =>
          playbookRunsRepo.setStatus(tx, playbookRunId, "cancelled", now)
        );

        const cancellable = yield* tryDb(() =>
          jobsRepo.listCancellableForPlaybookRun(tx, caseId, playbookRunId)
        );
        const updatedIds = yield* Effect.forEach(
          cancellable,
          (row) => tryDb(() => jobsRepo.cancelCancellable(tx, row.id, now)),
          { concurrency: "unbounded" }
        );
        const cancelledJobIds = updatedIds.filter((id): id is string =>
          Boolean(id)
        );
        return { playbookRunId, cancelledJobIds };
      })
    );
    if (opts?.actorId) {
      yield* Effect.sync(() => {
        logProcess("playbook.cancel", "Playbook run cancelled", {
          caseId,
          playbookRunId,
          actorId: opts.actorId,
          cancelledJobCount: result.cancelledJobIds.length,
        });
      });
    }
    return result;
  });
}

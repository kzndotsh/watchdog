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
import { casesRepo, jobsRepo, playbookRunsRepo } from "@watchdog/db";
import {
  trimmedOrUndefined,
  type CaseId,
  type OrganizationId,
} from "@watchdog/schemas/shared";

import { actorLabelForPersist } from "../actors/actor-label-snapshot";
import { requireActorIdEffect } from "../actors/require-actor-id";
import { assertEvidenceIdsInCaseEffect } from "../evidence/evidence";
import {
  assertCaseInOrgEffect,
  assertEntityInCaseEffect,
} from "../graph/patch/guards";
import type { Db } from "../infra/db-service";
import { tryDb, tryDbWith, requireWritten } from "../infra/postgres-effect";
import { transact } from "../infra/postgres-tx";
import {
  ForbiddenError,
  InvalidError,
  NotFoundError,
  type DomainTag,
} from "../infra/tagged-errors";
import { hasCredentialEffect, type Vault } from "../infra/vault";
import { parseValidatedCapInputEffect } from "./cap-input";
import { appendJobActivityEffect } from "./job-activity";
import type { JobQueue } from "./job-queue";
import {
  enqueueCreatedJobEffect,
  toJobRecord,
  type JobRecord,
} from "./start-job";

export type RunPlaybookInput = {
  caseId: CaseId;
  organizationId: OrganizationId;
  playbookId: string;
  actorId: string;
  actorLabel?: string | null;
  actorKeyId?: string | null;
  seed: SeedValues;
};

export type PlaybookRunResult = {
  playbookId: string;
  playbookRunId: string;
  jobs: JobRecord[];
};

function loadPlaybookEffect(playbookId: string) {
  return Effect.try({
    try: () => requirePlaybook(playbookId),
    catch: () => new NotFoundError({ entity: "Playbook", id: playbookId }),
  });
}

function assertSeedAnchorsInCaseEffect(
  caseId: CaseId,
  seed: SeedValues
): Effect.Effect<void, DomainTag, Db> {
  return Effect.gen(function* assertSeedAnchorsInCaseGen() {
    if (seed.entityId !== undefined) {
      yield* assertEntityInCaseEffect(caseId, seed.entityId);
    }
    if (seed.evidenceId !== undefined) {
      yield* assertEvidenceIdsInCaseEffect(caseId, [seed.evidenceId]);
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
): Effect.Effect<Set<string>, DomainTag, Vault> {
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
): Effect.Effect<PlaybookRunResult, DomainTag, Db | JobQueue | Vault> {
  return Effect.gen(function* runPlaybookGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(
      input.caseId,
      input.organizationId
    );
    const playbookId = trimmedOrUndefined(input.playbookId);
    if (playbookId === undefined) {
      return yield* new InvalidError({ reason: "Playbook id is required" });
    }
    const playbook = yield* loadPlaybookEffect(playbookId);
    const { seed } = input;

    yield* assertSeedAnchorsInCaseEffect(scopedCaseId, seed);

    const plan = planPlaybook(playbook, seed);
    if ("kind" in plan) {
      return yield* new InvalidError({ reason: formatPlanError(plan) });
    }

    const descriptor = toPlaybookDescriptor(playbook);
    const actorId = yield* requireActorIdEffect(input.actorId);
    const present = yield* presentCredentialNamesEffect(
      actorId,
      credentialNamesFromDescriptor(descriptor)
    );

    const caseRow = yield* tryDbWith((exec) =>
      casesRepo.getById(exec, scopedCaseId, input.organizationId)
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
            caseId: scopedCaseId,
            playbookId: playbook.id,
            seed: seedJson,
            status: "running",
            actorId,
            actorLabel: actorLabelForPersist(input.actorLabel),
            actorKeyId: input.actorKeyId,
          })
        ).pipe(requireWritten("create playbook run"));

        const stepCap = requireCapability(plan.step.capabilityId);
        const stepInput = yield* parseValidatedCapInputEffect(
          stepCap,
          plan.step.input
        );
        const row = yield* tryDb(() =>
          jobsRepo.create(tx, {
            caseId: scopedCaseId,
            capabilityId: plan.step.capabilityId,
            input: stepInput,
            status: "queued",
            actorId,
            actorLabel: actorLabelForPersist(input.actorLabel),
            actorKeyId: input.actorKeyId,
            logs: [],
            playbookRunId: run.id,
            playbookStep: plan.step.playbookStep,
            playbookFanIndex: 0,
          })
        ).pipe(requireWritten(`create Job for step ${plan.step.playbookStep}`));

        yield* appendJobActivityEffect(tx, row, "queued");
        return { run, jobRows: [row] };
      })
    );

    yield* Effect.forEach(
      result.jobRows.filter((row) => row.status === "queued"),
      (row) => enqueueCreatedJobEffect(scopedCaseId, row, row.capabilityId),
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

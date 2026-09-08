import { Effect } from "effect";

import { requireCapability } from "@watchdog/caps";
import {
  casesRepo,
  db,
  evidenceRepo,
  jobsRepo,
  type EvidenceCapSeed,
  type JobRow,
} from "@watchdog/db";
import {
  EVIDENCE_EXTRACT_AI_CAPABILITY_ID,
  EVIDENCE_HARVEST_CAPABILITY_ID,
  URL_ENRICH_CAPABILITY_ID,
  evidenceIdsFromJobInputs,
  parseTrimmedCaseId,
  trimmedOrUndefined,
  type JsonObject,
} from "@watchdog/schemas";

import { requireActorIdEffect } from "../actors/require-actor-id";
import { loadActorUsersEffect } from "../actors/resolve-actor-labels";
import {
  assertCaseInOrgEffect,
  assertEntityInCaseEffect,
  requireTrimmedGraphId,
} from "../graph/patch/guards";
import { errorMessage } from "../infra/domain-error";
import {
  notifyEvidenceChangedEffect,
  notifyJobUpdateEffect,
} from "../infra/events";
import { tryDb } from "../infra/postgres-effect";
import { transact } from "../infra/postgres-tx";
import {
  InvalidError,
  NotFoundError,
  type DomainTag,
} from "../infra/tagged-errors";
import { assertCapAvailabilityEffect } from "../jobs/cap-availability";
import { parseValidatedCapInputEffect } from "../jobs/cap-input";
import {
  enqueueCreatedJobEffect,
  toJobRecord,
  type JobRecord,
} from "../jobs/start-job";

function startCapForEvidenceEffect(input: {
  caseId: string;
  organizationId: string;
  evidenceId: string;
  actorId: string;
  actorLabel?: string | null;
  capabilityId: string;
  matchActive: (job: JobRow, seed: EvidenceCapSeed) => boolean;
  buildInput: (seed: EvidenceCapSeed) => JsonObject;
  assertSeed?: (seed: EvidenceCapSeed) => Effect.Effect<void, DomainTag>;
}): Effect.Effect<JobRecord, DomainTag> {
  return Effect.gen(function* startCapForEvidenceGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(
      input.caseId,
      input.organizationId
    );
    const evidenceId = yield* requireTrimmedGraphId(
      input.evidenceId,
      "Evidence not found"
    );
    const actorId = yield* requireActorIdEffect(input.actorId);
    const cap = yield* Effect.try({
      try: () => requireCapability(input.capabilityId),
      catch: (error) => new NotFoundError({ resource: errorMessage(error) }),
    });

    const outcome = yield* transact((tx) =>
      Effect.gen(function* startCapForEvidenceTx() {
        const locked = yield* tryDb(() => casesRepo.lockById(tx, scopedCaseId));
        if (!locked) {
          return yield* new NotFoundError({ resource: "Case not found" });
        }

        const seed = yield* tryDb(() =>
          evidenceRepo.getCapSeedInCase(tx, scopedCaseId, evidenceId)
        );
        if (!seed) {
          return yield* new NotFoundError({ resource: "Evidence not found" });
        }
        if (input.assertSeed) {
          yield* input.assertSeed(seed);
        }

        const rawCapInput = input.buildInput(seed);
        const capInput = yield* parseValidatedCapInputEffect(cap, rawCapInput);
        let jobInput = capInput;
        if (typeof capInput.entityId === "string") {
          const scopedEntityId = yield* assertEntityInCaseEffect(
            scopedCaseId,
            capInput.entityId,
            tx
          );
          jobInput = { ...capInput, entityId: scopedEntityId };
        }

        yield* assertCapAvailabilityEffect({
          actorId,
          caseId: scopedCaseId,
          cap,
          allowThirdPartyEgress: locked.allowThirdPartyEgress,
        });

        const active = yield* tryDb(() =>
          jobsRepo.listActiveForCapability(
            tx,
            scopedCaseId,
            input.capabilityId,
            200
          )
        );
        for (const job of active) {
          if (input.matchActive(job, seed)) {
            return { kind: "existing" as const, job };
          }
        }

        const row = yield* tryDb(() =>
          jobsRepo.create(tx, {
            caseId: scopedCaseId,
            capabilityId: input.capabilityId,
            input: jobInput,
            status: "queued",
            actorId,
            actorLabel: input.actorLabel ?? null,
            logs: [],
          })
        );
        if (!row) {
          return yield* new InvalidError({ reason: "Failed to create Job" });
        }
        return { kind: "created" as const, job: row };
      })
    );

    if (outcome.kind === "existing") {
      const users = yield* loadActorUsersEffect([outcome.job.actorId]);
      return toJobRecord(outcome.job, null, null, users);
    }

    yield* enqueueCreatedJobEffect(
      scopedCaseId,
      outcome.job,
      input.capabilityId
    );
    yield* notifyJobUpdateEffect(scopedCaseId, outcome.job.id, "queued");
    const users = yield* loadActorUsersEffect([outcome.job.actorId]);
    return toJobRecord(outcome.job, null, null, users);
  });
}

export function processEvidenceEffect(input: {
  caseId: string;
  organizationId: string;
  evidenceId: string;
  actorId: string;
  actorLabel?: string | null;
  ai?: boolean;
}): Effect.Effect<JobRecord, DomainTag> {
  const capabilityId =
    input.ai === true
      ? EVIDENCE_EXTRACT_AI_CAPABILITY_ID
      : EVIDENCE_HARVEST_CAPABILITY_ID;

  return startCapForEvidenceEffect({
    caseId: input.caseId,
    organizationId: input.organizationId,
    evidenceId: input.evidenceId,
    actorId: input.actorId,
    actorLabel: input.actorLabel,
    capabilityId,
    matchActive: (job, seed) =>
      evidenceIdsFromJobInputs([job.input]).includes(seed.id),
    buildInput: (seed) => {
      const entityId =
        seed.entityId === null || seed.entityId === undefined
          ? undefined
          : (parseTrimmedCaseId(seed.entityId) ?? undefined);
      return {
        evidenceId: seed.id,
        ...(entityId === undefined ? {} : { entityId }),
      };
    },
  });
}

export function markEvidenceProcessedEffect(input: {
  caseId: string;
  evidenceId: string;
}): Effect.Effect<void, DomainTag> {
  return Effect.gen(function* markEvidenceProcessedGen() {
    const caseId = parseTrimmedCaseId(input.caseId) ?? undefined;
    const evidenceId = parseTrimmedCaseId(input.evidenceId) ?? undefined;
    if (caseId === undefined || evidenceId === undefined) {
      return;
    }
    const marked = yield* tryDb(() =>
      evidenceRepo.markProcessed(db, caseId, evidenceId)
    );
    if (marked) {
      yield* notifyEvidenceChangedEffect(caseId, evidenceId);
    }
  });
}

export function enrichUrlEvidenceEffect(input: {
  caseId: string;
  organizationId: string;
  evidenceId: string;
  actorId: string;
  actorLabel?: string | null;
}): Effect.Effect<JobRecord, DomainTag> {
  return startCapForEvidenceEffect({
    caseId: input.caseId,
    organizationId: input.organizationId,
    evidenceId: input.evidenceId,
    actorId: input.actorId,
    actorLabel: input.actorLabel,
    capabilityId: URL_ENRICH_CAPABILITY_ID,
    assertSeed: (seed) => {
      const url = (seed.sourceUrl ?? seed.text)?.trim();
      if (url === undefined || url === "" || !/^https?:\/\//i.test(url)) {
        return new InvalidError({
          reason: "Evidence has no http(s) URL to enrich",
        });
      }
      return Effect.void;
    },
    matchActive: (job, seed) => {
      const inputIds = evidenceIdsFromJobInputs([job.input]);
      if (inputIds.length > 0) {
        return inputIds.includes(seed.id);
      }
      const url = (seed.sourceUrl ?? seed.text)?.trim() ?? "";
      if (url === "") return false;
      const jobUrl =
        typeof job.input === "object" && job.input !== null
          ? trimmedOrUndefined((job.input as { url?: string }).url)
          : undefined;
      return jobUrl === url;
    },
    buildInput: (seed) => {
      const url = (seed.sourceUrl ?? seed.text)?.trim() ?? "";
      const entityId =
        seed.entityId === null || seed.entityId === undefined
          ? undefined
          : (parseTrimmedCaseId(seed.entityId) ?? undefined);
      return {
        url,
        sourceEvidenceId: seed.id,
        ...(entityId === undefined ? {} : { entityId }),
      };
    },
  });
}

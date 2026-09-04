import { Effect } from "effect";

import {
  db,
  evidenceRepo,
  jobsRepo,
  type EvidenceCapSeed,
  type JobRow,
} from "@watchdog/db";
import type { JsonObject } from "@watchdog/schemas";
import {
  EVIDENCE_EXTRACT_AI_CAPABILITY_ID,
  EVIDENCE_HARVEST_CAPABILITY_ID,
  URL_ENRICH_CAPABILITY_ID,
} from "@watchdog/schemas";

import { tryDb } from "../infra/postgres-effect";
import {
  InvalidError,
  NotFoundError,
  type DomainTag,
} from "../infra/tagged-errors";
import { startJobEffect, type JobRecord, toJobRecord } from "../jobs/start-job";

function startCapForEvidenceEffect(input: {
  caseId: string;
  evidenceId: string;
  actorId: string;
  capabilityId: string;
  matchActive: (job: JobRow, seed: EvidenceCapSeed) => boolean;
  buildInput: (seed: EvidenceCapSeed) => JsonObject;
  assertSeed?: (seed: EvidenceCapSeed) => Effect.Effect<void, DomainTag>;
}): Effect.Effect<JobRecord, DomainTag> {
  return Effect.gen(function* startCapForEvidenceGen() {
    const seed = yield* tryDb(() =>
      evidenceRepo.getCapSeedInCase(db, input.caseId, input.evidenceId)
    );
    if (!seed) {
      return yield* new NotFoundError({ resource: "Evidence not found" });
    }
    if (input.assertSeed) {
      yield* input.assertSeed(seed);
    }
    const active = yield* tryDb(() =>
      jobsRepo.listActiveForCapability(db, input.caseId, input.capabilityId)
    );
    for (const job of active) {
      if (input.matchActive(job, seed)) {
        return toJobRecord(job);
      }
    }
    return yield* startJobEffect({
      caseId: input.caseId,
      capabilityId: input.capabilityId,
      actorId: input.actorId,
      input: input.buildInput(seed),
    });
  });
}

export function processEvidenceEffect(input: {
  caseId: string;
  evidenceId: string;
  actorId: string;
  ai?: boolean;
}): Effect.Effect<JobRecord, DomainTag> {
  const capabilityId =
    input.ai === true
      ? EVIDENCE_EXTRACT_AI_CAPABILITY_ID
      : EVIDENCE_HARVEST_CAPABILITY_ID;

  return startCapForEvidenceEffect({
    caseId: input.caseId,
    evidenceId: input.evidenceId,
    actorId: input.actorId,
    capabilityId,
    matchActive: (job, seed) => {
      const eid =
        typeof job.input === "object" && job.input !== null
          ? (job.input as { evidenceId?: string }).evidenceId
          : undefined;
      return eid === seed.id;
    },
    buildInput: (seed) => ({
      evidenceId: seed.id,
      ...(typeof seed.entityId === "string" && seed.entityId !== ""
        ? { entityId: seed.entityId }
        : {}),
    }),
  });
}

export function markEvidenceProcessedEffect(input: {
  caseId: string;
  evidenceId: string;
}): Effect.Effect<void, DomainTag> {
  return tryDb(() =>
    evidenceRepo.markProcessed(db, input.caseId, input.evidenceId)
  ).pipe(Effect.asVoid);
}

export function enrichUrlEvidenceEffect(input: {
  caseId: string;
  evidenceId: string;
  actorId: string;
}): Effect.Effect<JobRecord, DomainTag> {
  return startCapForEvidenceEffect({
    caseId: input.caseId,
    evidenceId: input.evidenceId,
    actorId: input.actorId,
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
      const url = (seed.sourceUrl ?? seed.text)?.trim() ?? "";
      const inputUrl =
        typeof job.input === "object" && job.input !== null
          ? (job.input as { url?: string; sourceEvidenceId?: string }).url
          : undefined;
      const sourceId =
        typeof job.input === "object" && job.input !== null
          ? (job.input as { sourceEvidenceId?: string }).sourceEvidenceId
          : undefined;
      return sourceId === seed.id || inputUrl === url;
    },
    buildInput: (seed) => {
      const url = (seed.sourceUrl ?? seed.text)?.trim() ?? "";
      return {
        url,
        sourceEvidenceId: seed.id,
        ...(typeof seed.entityId === "string" && seed.entityId !== ""
          ? { entityId: seed.entityId }
          : {}),
      };
    },
  });
}

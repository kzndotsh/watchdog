import { Effect } from "effect";

import type {
  CaseId,
  JobStatus,
  OrganizationId,
} from "@watchdog/schemas/shared";

import { actorLabelForPersist } from "../actors/actor-label-snapshot";
import { requireActorIdEffect } from "../actors/require-actor-id";
import { getCaseByIdEffect } from "../cases/cases";
import { writeCaseExportZipEffect } from "../export/case-export";
import { caseExportObjectKey } from "../export/export-objects";
import { multipartSinkEffect } from "../export/multipart-sink";
import {
  caseExportSettings,
  type CaseExportSettings,
} from "../export/settings";
import { assertCaseInOrgEffect } from "../graph/patch/guards";
import { createPresignedGetEffect } from "../infra/blob";
import type { BlobStore } from "../infra/blob-store";
import { nowMillisEffect } from "../infra/clock";
import type { Db } from "../infra/db-service";
import { requireWritten } from "../infra/postgres-effect";
import { transact } from "../infra/postgres-tx";
import { jobsRepoFx, jobsRepoFxDb } from "../infra/repos-fx";
import {
  InternalError,
  NotFoundError,
  type DomainTag,
} from "../infra/tagged-errors";
import { appendJobActivityEffect } from "./job-activity";
import type { JobQueue } from "./job-queue";
import type { SystemJobContext, SystemJobFinish } from "./lifecycle/run";
import { underJobTimer } from "./lifecycle/timer";
import { enqueueCreatedJobEffect } from "./start-job";
import { CASE_EXPORT_JOB, systemJobTimeoutMs } from "./system-jobs";

export type StartCaseExportInput = {
  caseId: CaseId;
  organizationId: OrganizationId;
  actorId: string;
  /** When the caller is an API key, `api-key:<keyname>`. */
  actorLabel?: string | null;
  actorKeyId?: string | null;
};

export type StartedCaseExport = {
  readonly jobId: string;
  readonly status: JobStatus;
  /** False when an export of this Case was already queued or running, and this call joined it. */
  readonly created: boolean;
};

/**
 * Queue the export of a Case as a system Job (`system.case_export`). A Case has at most one
 * open export: asking again while one is queued or running returns that Job, so a second click
 * does not build a second multi-gigabyte archive.
 */
export function startCaseExportJobEffect(
  input: StartCaseExportInput
): Effect.Effect<StartedCaseExport, DomainTag, Db | JobQueue> {
  return Effect.gen(function* startCaseExportJobGen() {
    const caseId = yield* assertCaseInOrgEffect(
      input.caseId,
      input.organizationId
    );
    const actorId = yield* requireActorIdEffect(input.actorId);
    const [open] = yield* jobsRepoFxDb.listActiveForCapability(
      caseId,
      CASE_EXPORT_JOB,
      1
    );
    if (open !== undefined) {
      return { jobId: open.id, status: open.status, created: false };
    }
    const row = yield* transact((tx) =>
      Effect.gen(function* createExportJobTx() {
        const created = yield* jobsRepoFx
          .create(tx, {
            caseId,
            capabilityId: CASE_EXPORT_JOB,
            input: {},
            status: "queued",
            actorId,
            actorLabel: actorLabelForPersist(input.actorLabel),
            actorKeyId: input.actorKeyId,
            logs: [],
          })
          .pipe(requireWritten("create export Job"));
        yield* appendJobActivityEffect(tx, created, "queued");
        return created;
      })
    );
    yield* enqueueCreatedJobEffect(caseId, row, CASE_EXPORT_JOB);
    return { jobId: row.id, status: row.status, created: true };
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  return mb < 1024 ? `${Math.round(mb)} MB` : `${(mb / 1024).toFixed(1)} GB`;
}

/**
 * The body of a `system.case_export` Job: stream the zip into a multipart upload at
 * `exports/{caseId}/{jobId}.zip`, under the Job's abort timer. A failure or a cancel aborts the
 * upload, so a half-written archive is never left behind.
 */
export function caseExportBody(
  { job, jobLog, stop }: SystemJobContext,
  settings: CaseExportSettings = caseExportSettings()
): Effect.Effect<SystemJobFinish, DomainTag, Db | BlobStore> {
  return Effect.scoped(
    Effect.gen(function* caseExportBodyGen() {
      const sink = yield* multipartSinkEffect(
        caseExportObjectKey(job.caseId, job.id),
        "application/zip"
      );
      const stats = yield* underJobTimer(
        systemJobTimeoutMs(CASE_EXPORT_JOB),
        stop,
        writeCaseExportZipEffect(job.caseId, sink, settings)
      );
      jobLog.log(
        `exported ${stats.markdownFiles} notes and ${stats.evidenceIncluded} Evidence files${
          stats.evidenceSkipped > 0
            ? ` (${stats.evidenceSkipped} could not be read and were left out)`
            : ""
        }`
      );
      const hours = Math.round(settings.linkTtlMs / 3_600_000);
      return {
        resultSummary: `Case export ready: ${stats.markdownFiles} notes, ${stats.evidenceIncluded} Evidence files (${formatBytes(stats.evidenceBytes)}). The download link works for ${hours} h.`,
      };
    })
  );
}

export type CaseExportLink =
  | { readonly kind: "pending"; readonly status: JobStatus }
  | {
      readonly kind: "ended";
      readonly status: JobStatus;
      readonly error: string | null;
    }
  | { readonly kind: "expired"; readonly expiredAt: string }
  | {
      readonly kind: "ready";
      /** A short-lived URL to the archive: redirect the browser to it. */
      readonly url: string;
      readonly filename: string;
      readonly expiresAt: string;
    };

/** The longest a signed download URL lives: the stable link hands out a fresh one per click. */
const SIGNED_URL_MAX_SECONDS = 300;

/**
 * Where the download of an export Job stands. The link is the Job's own: it works from the
 * moment the Job succeeds until `finishedAt` plus the link lifetime (`WD_EXPORT_LINK_TTL_HOURS`),
 * then answers `expired` (the worker's sweep deletes the archive). A `ready` answer carries a
 * signed URL that never outlives the link.
 */
export function caseExportLinkEffect(
  input: { caseId: CaseId; organizationId: OrganizationId; jobId: string },
  settings: CaseExportSettings = caseExportSettings()
): Effect.Effect<CaseExportLink, DomainTag, Db | BlobStore> {
  return Effect.gen(function* caseExportLinkGen() {
    const activeCase = yield* getCaseByIdEffect(
      input.caseId,
      input.organizationId
    );
    const found = yield* jobsRepoFxDb.getInCase(activeCase.id, input.jobId);
    if (found === null || found.job.capabilityId !== CASE_EXPORT_JOB) {
      return yield* new NotFoundError({ entity: "Job", id: input.jobId });
    }
    const { job } = found;
    if (job.status === "queued" || job.status === "running") {
      return { kind: "pending" as const, status: job.status };
    }
    if (job.status !== "succeeded" || job.finishedAt === null) {
      return { kind: "ended" as const, status: job.status, error: job.error };
    }
    const expiresAtMs = job.finishedAt.getTime() + settings.linkTtlMs;
    const now = yield* nowMillisEffect;
    if (now >= expiresAtMs) {
      return {
        kind: "expired" as const,
        expiredAt: new Date(expiresAtMs).toISOString(),
      };
    }
    const filename = `${activeCase.slug}-${job.finishedAt
      .toISOString()
      .slice(0, 16)
      .replaceAll(/[-T:]/g, "")}.zip`;
    const url = yield* createPresignedGetEffect(
      caseExportObjectKey(activeCase.id, job.id),
      Math.max(
        1,
        Math.min(SIGNED_URL_MAX_SECONDS, Math.floor((expiresAtMs - now) / 1000))
      ),
      filename
    ).pipe(
      Effect.mapError(
        (cause) =>
          new InternalError({ reason: "Couldn't sign the export link", cause })
      )
    );
    return {
      kind: "ready" as const,
      url,
      filename,
      expiresAt: new Date(expiresAtMs).toISOString(),
    };
  });
}

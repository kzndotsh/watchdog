/**
 * export-sync.ts — File system sync for the live Export shadow workspace.
 *
 * Writes rendered entity markdown + evidence files to:
 *   <WD_EXPORT_DIR>/<organization-id>/<case-slug>/{persons,infras,orgs}/<entity-slug>.md
 *   <WD_EXPORT_DIR>/<organization-id>/<case-slug>/evidence/<id-prefix>--<label>.ext
 * (Case slugs are unique per organization, so the organization is part of the path.)
 */

import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import nodePath from "node:path";

import { Context, Data, Effect, Fiber, Layer, SynchronizedRef } from "effect";

import type { EvidenceRow } from "@watchdog/db";
import { env } from "@watchdog/env/server";
import { evidenceDisplayLabel } from "@watchdog/schemas/evidence";
import { parseTrimmedCaseId } from "@watchdog/schemas/shared";

import { readArtifactBytesEffect } from "./blob";
import { blobStoreLayer, type BlobStore } from "./blob-store";
import { Db } from "./db-service";
import { errorMessage } from "./error-utils";
import { renderCaseExportEffect } from "./export";
import { logProcess, logSwallowed } from "./process-log";

export class ExportIOError extends Data.TaggedError("ExportIOError")<{
  readonly reason: string;
}> {
  readonly code = "export_io" as const;
}

function mapExportCatch(error: unknown): ExportIOError {
  if (error instanceof ExportIOError) return error;
  return new ExportIOError({ reason: errorMessage(error) });
}

function exportRoot(): string {
  return (
    env.WD_EXPORT_DIR ??
    nodePath.join(new URL("../../../../export", import.meta.url).pathname)
  );
}

/** `<export>/<organizationId>/<caseSlug>`; null if either segment would escape the export root. */
function exportDirFor(organizationId: string, slug: string): string | null {
  const root = nodePath.resolve(exportRoot());
  const orgDir = nodePath.resolve(root, organizationId);
  const dir = nodePath.resolve(orgDir, slug);
  if (
    orgDir === root ||
    !orgDir.startsWith(`${root}${nodePath.sep}`) ||
    dir === orgDir ||
    !dir.startsWith(`${orgDir}${nodePath.sep}`)
  ) {
    return null;
  }
  return dir;
}

function writeEffect(
  path: string,
  content: string | Uint8Array
): Effect.Effect<void, ExportIOError> {
  return Effect.tryPromise({
    try: () =>
      mkdir(nodePath.dirname(path), { recursive: true }).then(() =>
        writeFile(path, content)
      ),
    catch: mapExportCatch,
  });
}

export function safeFilename(label: string): string {
  return (
    label
      // oxlint-disable-next-line eslint/no-control-regex -- intentionally strips filesystem-illegal control chars
      .replaceAll(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
      .replaceAll(/\s+/g, "-")
      .slice(0, 80)
  );
}

function evidenceExt(mime: string | null, label: string | null): string {
  if (label !== null) {
    const ext = nodePath.extname(label);
    if (ext) return ext;
  }
  if (mime === null) return ".bin";
  const map: Record<string, string> = {
    "application/json": ".json",
    "text/plain": ".txt",
    "text/html": ".html",
    "text/markdown": ".md",
    "application/pdf": ".pdf",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
  };
  const base = mime.split(";")[0]?.trim() ?? "";
  return map[base] ?? ".bin";
}

interface EvidenceExportCounts {
  included: number;
  skipped: number;
}

type EvidenceWriteOutcome = "included" | "skipped" | "none";

function writeUriEvidenceFileEffect(
  caseId: string,
  evidenceDir: string,
  ev: EvidenceRow
): Effect.Effect<EvidenceWriteOutcome, never, BlobStore> {
  const prefix = ev.id.slice(0, 8);
  const labelBase = safeFilename(
    evidenceDisplayLabel({
      label: ev.label,
      kind: ev.kind,
      sourceUrl: ev.sourceUrl,
    })
  );
  if (!ev.uri) return Effect.succeed("skipped");
  const uri = ev.uri;
  return Effect.gen(function* writeUriEvidenceGen() {
    const bytes = yield* readArtifactBytesEffect(uri);
    const ext = evidenceExt(ev.mime, ev.label);
    const filename = `${prefix}--${labelBase}${ext}`;
    yield* writeEffect(nodePath.join(evidenceDir, filename), bytes);
    return "included" as const;
  }).pipe(
    Effect.tapError((error) =>
      Effect.sync(() => {
        logSwallowed("export-sync.evidence_skip", error, {
          caseId,
          evidenceId: ev.id,
        });
      })
    ),
    Effect.orElseSucceed(() => "skipped" as const)
  );
}

function writeInlineEvidenceFileEffect(
  evidenceDir: string,
  ev: EvidenceRow
): Effect.Effect<void, ExportIOError> {
  const prefix = ev.id.slice(0, 8);
  const labelBase = safeFilename(
    evidenceDisplayLabel({
      label: ev.label,
      kind: ev.kind,
      sourceUrl: ev.sourceUrl,
    })
  );
  const filename = `${prefix}--${labelBase}.txt`;
  if (ev.text === null || ev.text === undefined) return Effect.void;
  return writeEffect(nodePath.join(evidenceDir, filename), ev.text);
}

function writeOneEvidenceFileEffect(
  caseId: string,
  evidenceDir: string,
  ev: EvidenceRow
): Effect.Effect<EvidenceWriteOutcome, ExportIOError, BlobStore> {
  if (ev.uri !== null) {
    return writeUriEvidenceFileEffect(caseId, evidenceDir, ev);
  }
  if (ev.text !== null && ev.text !== "" && ev.kind !== "attestation") {
    return writeInlineEvidenceFileEffect(evidenceDir, ev).pipe(
      Effect.as("included" as const)
    );
  }
  return Effect.succeed("none");
}

function writeCaseEvidenceFilesEffect(
  caseId: string,
  evidenceDir: string,
  evidenceRows: EvidenceRow[]
): Effect.Effect<EvidenceExportCounts, ExportIOError, BlobStore> {
  return Effect.gen(function* writeCaseEvidenceFilesGen() {
    const outcomes = yield* Effect.forEach(
      evidenceRows,
      (ev) => writeOneEvidenceFileEffect(caseId, evidenceDir, ev),
      { concurrency: "unbounded" }
    );
    const counts: EvidenceExportCounts = { included: 0, skipped: 0 };
    for (const outcome of outcomes) {
      if (outcome === "included") counts.included += 1;
      else if (outcome === "skipped") counts.skipped += 1;
    }
    return counts;
  });
}

export function writeCaseExportEffect(
  caseId: string
): Effect.Effect<void, ExportIOError, Db | BlobStore> {
  return Effect.gen(function* writeCaseExportGen() {
    const {
      files: mdFiles,
      evidenceRows,
      location,
    } = yield* renderCaseExportEffect(caseId).pipe(
      Effect.mapError((error) => new ExportIOError({ reason: error.message }))
    );
    if (mdFiles.size === 0) return;

    if (location === null || location.caseSlug === "") return;
    const root = exportDirFor(location.organizationId, location.caseSlug);
    if (root === null) return;

    yield* Effect.forEach(
      [...mdFiles],
      ([relPath, content]) =>
        writeEffect(nodePath.join(root, relPath), content),
      { concurrency: "unbounded" }
    );

    const evidenceDir = nodePath.join(root, "evidence");
    yield* Effect.tryPromise({
      try: () => mkdir(evidenceDir, { recursive: true }),
      catch: mapExportCatch,
    });

    const { included: evidenceIncluded, skipped: evidenceSkipped } =
      yield* writeCaseEvidenceFilesEffect(caseId, evidenceDir, evidenceRows);

    if (evidenceSkipped > 0) {
      yield* Effect.sync(() => {
        logProcess("export-sync", "evidence blob skips during case export", {
          caseId,
          evidenceIncluded,
          evidenceSkipped,
        });
      });
    }
  });
}

type ExportWriter = (
  id: string
) => Effect.Effect<void, ExportIOError, Db | BlobStore>;
type ExportWrite = (id: string) => Effect.Effect<void, ExportIOError>;

interface ExportCoalesceState {
  dirty: Set<string>;
  inFlight: Map<string, Fiber.Fiber<void>>;
}

const exportCoalesce = SynchronizedRef.makeUnsafe({
  dirty: new Set<string>(),
  inFlight: new Map<string, Fiber.Fiber<void>>(),
});

function withDirty(
  state: ExportCoalesceState,
  caseId: string
): ExportCoalesceState {
  return { dirty: new Set([...state.dirty, caseId]), inFlight: state.inFlight };
}

function writeExportEffect(
  caseId: string,
  writeExport: ExportWrite
): Effect.Effect<void> {
  return writeExport(caseId).pipe(
    Effect.tapError((error) =>
      Effect.sync(() => {
        logSwallowed("export-sync.write", error, { caseId });
      })
    ),
    Effect.ignore
  );
}

function exportLoop(
  caseId: string,
  writeExport: ExportWrite
): Effect.Effect<void> {
  return Effect.gen(function* exportLoopGen() {
    while (true) {
      const step = yield* SynchronizedRef.modify(exportCoalesce, (current) => {
        if (current.dirty.has(caseId)) {
          const dirty = new Set(current.dirty);
          dirty.delete(caseId);
          return ["write", { dirty, inFlight: current.inFlight }] as const;
        }
        const inFlight = new Map(current.inFlight);
        inFlight.delete(caseId);
        return ["done", { dirty: current.dirty, inFlight }] as const;
      });
      if (step === "done") {
        break;
      }
      yield* writeExportEffect(caseId, writeExport);
    }
  });
}

function claimExportJoin(
  caseId: string,
  writeExport: ExportWrite
): Effect.Effect<Effect.Effect<void>> {
  return SynchronizedRef.modifyEffect(exportCoalesce, (state) => {
    const marked = withDirty(state, caseId);
    const existing = marked.inFlight.get(caseId);
    if (existing !== undefined) {
      return Effect.succeed([Fiber.join(existing), marked] as const);
    }

    return Effect.gen(function* startExportFiberGen() {
      const fiber = yield* exportLoop(caseId, writeExport).pipe(
        Effect.forkDetach({ startImmediately: true })
      );
      const inFlight = new Map([...marked.inFlight, [caseId, fiber]]);
      return [Fiber.join(fiber), { dirty: marked.dirty, inFlight }] as const;
    });
  });
}

/**
 * The services the detached export write runs with, as a Layer the write fiber
 * builds itself and releases when each write ends. The write fiber outlives
 * the interpreting caller, so it must not reuse the caller's `Db` (a
 * transaction handle that may roll back) or `BlobStore` (an `S3Client` the
 * caller's scope may destroy): the default is the live pool plus a fresh
 * `S3Client`, built and destroyed within the fiber.
 *
 * Tests that need a fake store provide this key (`Effect.provideService`) with
 * a Layer, e.g. `Layer.mergeAll(Db.layer, recordingBlobStore().layer)`; it is
 * read when the write is claimed. The Layer is built once per write, so a
 * scoped resource in it lives only for that write.
 */
export const ExportWriteServices = Context.Reference<
  Layer.Layer<Db | BlobStore>
>("@watchdog/core/infra/ExportWriteServices", {
  defaultValue: () => Layer.mergeAll(Db.layer, blobStoreLayer),
});

/**
 * First stage of `scheduleCaseExportEffect`: marks the case dirty and
 * starts-or-joins the write fiber, then returns the Effect that waits for the
 * write. Split out so a caller can run the mark in its own fiber and fork only
 * the wait: a shutdown that interrupts the forked wait cannot lose the mark.
 * The write fiber outlives the caller, so it runs with `ExportWriteServices`
 * (the live pool and its own `BlobStore`), never the caller's `Db` / `BlobStore`.
 */
export function claimCaseExportEffect(
  caseId: string,
  writeExport: ExportWriter = writeCaseExportEffect
): Effect.Effect<Effect.Effect<void>> {
  const normalizedCaseId = parseTrimmedCaseId(caseId) ?? undefined;
  if (normalizedCaseId === undefined) return Effect.succeed(Effect.void);
  return Effect.gen(function* claimCaseExportGen() {
    const services = yield* ExportWriteServices;
    return yield* claimExportJoin(normalizedCaseId, (id) =>
      Effect.provide(writeExport(id), services)
    );
  });
}

/**
 * Schedule a Case export write. Concurrent calls for the same case coalesce
 * into one in-flight write, then at most one follow-up if more events arrived.
 * `writeExport` is injectable so unit tests can assert coalesce without object storage.
 *
 * Marks dirty and starts-or-joins the write fiber when the returned Effect is
 * interpreted. The write fiber is independent of the caller's lifetimes: it
 * provides its own `Db` / `BlobStore` (see `ExportWriteServices`), so the
 * caller needs no services for it.
 */
export function scheduleCaseExportEffect(
  caseId: string,
  writeExport: ExportWriter = writeCaseExportEffect
): Effect.Effect<void> {
  return Effect.flatten(claimCaseExportEffect(caseId, writeExport));
}

/** Best-effort: drop the live Export shadow dir for a deleted Case. */
export function removeCaseExportDirEffect(
  organizationId: string,
  slug: string
): Effect.Effect<void, ExportIOError> {
  const dir = exportDirFor(organizationId, slug);
  if (dir === null) return Effect.void;
  return Effect.tryPromise({
    try: () => rm(dir, { recursive: true, force: true }),
    catch: mapExportCatch,
  });
}

/** Best-effort: move the Export shadow dir when a Case slug changes. */
export function renameCaseExportDirEffect(
  organizationId: string,
  fromSlug: string,
  toSlug: string
): Effect.Effect<void, ExportIOError> {
  if (fromSlug === toSlug) return Effect.void;
  const from = exportDirFor(organizationId, fromSlug);
  const to = exportDirFor(organizationId, toSlug);
  if (from === null || to === null) return Effect.void;
  return Effect.gen(function* renameCaseExportDirGen() {
    yield* Effect.tryPromise({
      try: () => rm(to, { recursive: true, force: true }),
      catch: mapExportCatch,
    });
    yield* Effect.tryPromise({
      try: () =>
        rename(from, to).catch((error: unknown) => {
          if (
            error instanceof Error &&
            "code" in error &&
            error.code === "ENOENT"
          ) {
            return;
          }
          throw error;
        }),
      catch: mapExportCatch,
    });
  });
}

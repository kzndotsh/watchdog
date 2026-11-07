import { Effect } from "effect";

import type { CaseId } from "@watchdog/schemas/shared";

import { blobStoreLayer, uploadArtifactEffect } from "../../../infra/blob";
import type { CaseExportSettings } from "../../settings";

export const MIB = 1024 * 1024;

/** Export settings for the Case export tests: inline up to 100 MiB, four reads at once. */
export const SETTINGS: CaseExportSettings = {
  inlineMaxBytes: 100 * MIB,
  linkTtlMs: 60_000,
  concurrency: 4,
};

/** Store `bytes` as a Case artifact; returns its uri and sha256 for an Evidence row. */
export function upload(caseId: CaseId, bytes: Uint8Array, name: string) {
  return Effect.runPromise(
    uploadArtifactEffect({
      caseId,
      bytes,
      mime: "application/octet-stream",
      name,
    }).pipe(Effect.provide(blobStoreLayer))
  );
}

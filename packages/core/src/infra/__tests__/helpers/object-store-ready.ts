import { randomUUID } from "node:crypto";

import { Effect } from "effect";
import { beforeAll, vi } from "vitest";

import { asCaseId } from "@watchdog/schemas/shared";

import { deleteObjectKeysEffect, uploadArtifactEffect } from "../../blob";
import { blobStoreLayer } from "../../blob-store";

/** Longest a freshly started object store gets to take its first write. */
const OBJECT_STORE_READY_TIMEOUT_MS = 60_000;

const RETRY_DELAY_MS = 500;

async function probeOnce(): Promise<void> {
  const caseId = asCaseId(randomUUID());
  const uploaded = await Effect.runPromise(
    uploadArtifactEffect({
      caseId,
      bytes: new TextEncoder().encode("ready"),
      mime: "text/plain",
      name: "ready.txt",
    }).pipe(Effect.provide(blobStoreLayer))
  );
  await Effect.runPromise(
    deleteObjectKeysEffect([uploaded.uri]).pipe(Effect.provide(blobStoreLayer))
  );
}

/**
 * Wait until the real object store (SeaweedFS) takes a write. A store that has just started
 * allocates its first volume and creates the bucket on the first PUT, which takes seconds; the
 * suite's tests then each spend part of their 5 s budget on that cold start, so whichever test
 * ran first (or the 300 KB upload of an Export test) timed out under load. One write and one
 * delete here pays that cost once, with a deadline that says so, instead of inside a test.
 */
async function waitForObjectStore(
  timeoutMs: number = OBJECT_STORE_READY_TIMEOUT_MS
): Promise<void> {
  await vi.waitFor(probeOnce, { timeout: timeoutMs, interval: RETRY_DELAY_MS });
}

/** Register the readiness wait as this file's `beforeAll`, with a hook timeout that outlasts it. */
export function warmObjectStore(): void {
  beforeAll(() => waitForObjectStore(), OBJECT_STORE_READY_TIMEOUT_MS + 5000);
}

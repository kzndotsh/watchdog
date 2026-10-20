import { Layer } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { recordingBlobStore, sha256Hex } from "@watchdog/core/blob";
import {
  confirmFileUploadEffect,
  presignUploadEffect,
  sweepAbandonedUploadsEffect,
  UPLOAD_SWEEP_GRACE_MS,
} from "@watchdog/core/evidence";
import { Db, runDomainWith } from "@watchdog/core/infra";
import { db } from "@watchdog/db";
import type { CaseId } from "@watchdog/schemas/shared";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import {
  backdateEvidenceUpload,
  listEvidenceUploadUris,
  resetTestDb,
  seedCase,
} from "@watchdog/test-db";
import { TEST_ACTOR_ID } from "@watchdog/test-kit";

const blob = recordingBlobStore();
const runDomain = runDomainWith(Layer.mergeAll(Db.layer, blob.layer));

const HOUR_MS = 60 * 60 * 1000;

/** Presign an upload of `text`, put its object in the store, and age the record by `ageMs`. */
async function pending(caseId: CaseId, text: string, ageMs: number) {
  const bytes = new TextEncoder().encode(text);
  const declared = {
    sha256: sha256Hex(bytes),
    mime: "text/plain",
    byteLength: bytes.byteLength,
  };
  const put = await runDomain(
    presignUploadEffect({
      caseId,
      organizationId: TEST_ORGANIZATION_ID,
      name: "doc.txt",
      actorId: TEST_ACTOR_ID,
      ...declared,
    })
  );
  blob.objects.set(put.uri, bytes);
  await backdateEvidenceUpload(
    db,
    caseId,
    put.uri,
    new Date(Date.now() - ageMs)
  );
  return { put, declared };
}

const recordedUris = (caseId: CaseId) => listEvidenceUploadUris(db, caseId);

const PAST_GRACE = UPLOAD_SWEEP_GRACE_MS + HOUR_MS;

describe("orphan sweep (#305)", () => {
  beforeEach(async () => {
    await resetTestDb();
    blob.objects.clear();
  });

  it("deletes the object and record of an upload never confirmed within the window, and only those", async () => {
    const cased = await seedCase(db);
    const stale = await pending(cased.id, "stale upload", PAST_GRACE);
    const fresh = await pending(cased.id, "fresh upload", HOUR_MS);
    const confirmed = await pending(cased.id, "confirmed upload", PAST_GRACE);
    await runDomain(
      confirmFileUploadEffect(
        {
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          uri: confirmed.put.uri,
          ...confirmed.declared,
        },
        TEST_ACTOR_ID
      )
    );

    const summary = await runDomain(sweepAbandonedUploadsEffect());

    expect(summary).toEqual({ swept: 1 });
    expect(blob.objects.has(stale.put.uri)).toBe(false);
    expect(blob.objects.has(fresh.put.uri)).toBe(true);
    expect(blob.objects.has(confirmed.put.uri)).toBe(true);
    const recorded = await recordedUris(cased.id);
    expect(recorded).toHaveLength(2);
    expect(recorded).toEqual(
      expect.arrayContaining([fresh.put.uri, confirmed.put.uri])
    );
  });

  it("is idempotent: a second run finds nothing and changes nothing", async () => {
    const cased = await seedCase(db);
    await pending(cased.id, "stale upload", PAST_GRACE);
    const keep = await pending(cased.id, "fresh upload", HOUR_MS);

    await runDomain(sweepAbandonedUploadsEffect());
    const again = await runDomain(sweepAbandonedUploadsEffect());

    expect(again).toEqual({ swept: 0 });
    expect([...blob.objects.keys()]).toEqual([keep.put.uri]);
    expect(await recordedUris(cased.id)).toEqual([keep.put.uri]);
  });

  it("is bounded per run and drains the backlog over runs, oldest first", async () => {
    const cased = await seedCase(db);
    const oldest = await pending(cased.id, "oldest", PAST_GRACE + 3 * HOUR_MS);
    const middle = await pending(cased.id, "middle", PAST_GRACE + 2 * HOUR_MS);
    const newest = await pending(cased.id, "newest", PAST_GRACE + HOUR_MS);

    const first = await runDomain(sweepAbandonedUploadsEffect({ limit: 2 }));
    expect(first).toEqual({ swept: 2 });
    expect(blob.objects.has(oldest.put.uri)).toBe(false);
    expect(blob.objects.has(middle.put.uri)).toBe(false);
    expect(blob.objects.has(newest.put.uri)).toBe(true);

    const second = await runDomain(sweepAbandonedUploadsEffect({ limit: 2 }));
    expect(second).toEqual({ swept: 1 });
    expect(blob.objects.size).toBe(0);
  });

  it("never deletes an object that backs Evidence, even when the same file is presigned again", async () => {
    const cased = await seedCase(db);
    const first = await pending(cased.id, "recorded file", 2 * HOUR_MS);
    await runDomain(
      confirmFileUploadEffect(
        {
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          uri: first.put.uri,
          ...first.declared,
        },
        TEST_ACTOR_ID
      )
    );
    // The same file presigned again and never confirmed: same key, record pending and old.
    const again = await pending(cased.id, "recorded file", PAST_GRACE);
    expect(again.put.uri).toBe(first.put.uri);

    await runDomain(sweepAbandonedUploadsEffect());

    expect(blob.objects.has(first.put.uri)).toBe(true);
    expect(await recordedUris(cased.id)).toEqual([]);
  });

  it("keeps the records when the store fails, so the next run retries", async () => {
    const failing = recordingBlobStore({
      respond: ({ command }) => {
        if (command === "DeleteObjectsCommand") {
          return { Errors: [{ Key: "k", Code: "InternalError" }] };
        }
        return undefined;
      },
    });
    const runFailing = runDomainWith(Layer.mergeAll(Db.layer, failing.layer));
    const cased = await seedCase(db);
    const stale = await pending(cased.id, "stale upload", PAST_GRACE);

    await expect(
      runFailing(sweepAbandonedUploadsEffect())
    ).rejects.toBeDefined();
    expect(await recordedUris(cased.id)).toEqual([stale.put.uri]);

    await runDomain(sweepAbandonedUploadsEffect());
    expect(await recordedUris(cased.id)).toEqual([]);
  });
});

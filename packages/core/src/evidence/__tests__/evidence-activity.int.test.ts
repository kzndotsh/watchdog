import { Effect, Layer } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { appendActivityEffect } from "@watchdog/core/activity";
import { recordingBlobStore } from "@watchdog/core/blob";
import { InternalError } from "@watchdog/core/errors";
import {
  attachEvidenceEntityEffect,
  confirmFileUploadEffect,
  createAttestationEffect,
  dumpPasteEffect,
  dumpUrlEffect,
  markEvidenceProcessedEffect,
  restoreEvidenceEffect,
  softDeleteEvidenceEffect,
} from "@watchdog/core/evidence";
import { Db, runDomainWith, transact } from "@watchdog/core/infra";
import { activity, activityLogRepo, db } from "@watchdog/db";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import {
  resetTestDb,
  seedCase,
  seedEntity,
  seedEvidence,
} from "@watchdog/test-db";
import { TEST_ACTOR_ID } from "@watchdog/test-kit";

const UPLOAD_SHA = "ab".repeat(32);

const blob = recordingBlobStore({
  respond: (call) =>
    call.command === "HeadObjectCommand"
      ? {
          Metadata: { sha256: UPLOAD_SHA },
          ContentLength: 4,
          ContentType: "application/octet-stream",
        }
      : undefined,
});
const runDomain = runDomainWith(Layer.mergeAll(Db.layer, blob.layer));

const START = { xid: "0", id: 0 } as const;

async function log() {
  const rows = await activityLogRepo.drain(db, { after: START, limit: 1000 });
  return rows.filter((row) => row.kind === "evidence");
}

/** The seeds append their own entries; these tests count only what the code under test appends. */
async function forgetSeedActivity() {
  await db.delete(activity);
}

describe("Evidence write paths append to the activity log", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("logs a captured entry for dump paste, dump url and a confirmed upload", async () => {
    const cased = await seedCase(db);
    const base = {
      caseId: cased.id,
      organizationId: TEST_ORGANIZATION_ID,
    } as const;
    const pasted = await runDomain(
      dumpPasteEffect({
        ...base,
        body: "Contact ada@mailhost.test",
        label: "paste note",
        actorId: TEST_ACTOR_ID,
      })
    );
    const url = await runDomain(
      dumpUrlEffect({
        ...base,
        sourceUrl: "https://example.test/post",
        actorId: TEST_ACTOR_ID,
      })
    );
    const uploaded = await runDomain(
      confirmFileUploadEffect(
        {
          ...base,
          uri: `${cased.id}/file.bin`,
          sha256: UPLOAD_SHA,
          mime: "application/octet-stream",
          byteLength: 4,
          label: "scan",
        },
        TEST_ACTOR_ID
      )
    );

    const rows = await log();
    expect(rows.map((row) => row.action)).toEqual([
      "captured",
      "captured",
      "captured",
    ]);
    expect(rows.map((row) => row.subjectId)).toEqual([
      pasted.id,
      url.id,
      uploaded.id,
    ]);
    expect(rows.map((row) => row.label)).toEqual([
      "paste note",
      "example.test",
      "scan",
    ]);
    expect(rows.every((row) => row.actorId === TEST_ACTOR_ID)).toBe(true);
    expect(rows.every((row) => row.caseId === cased.id)).toBe(true);
  });

  it("logs hide, restore and attach, each once, with the Evidence as subject", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id);
    const evidence = await seedEvidence(db, cased.id, { label: "kept note" });
    await forgetSeedActivity();
    const base = {
      caseId: cased.id,
      organizationId: TEST_ORGANIZATION_ID,
      evidenceId: evidence.id,
    } as const;

    await runDomain(softDeleteEvidenceEffect(base));
    await runDomain(restoreEvidenceEffect(base));
    await runDomain(
      attachEvidenceEntityEffect({ ...base, entityId: entity.id })
    );

    const rows = await log();
    expect(rows.map((row) => row.action)).toEqual([
      "hidden",
      "restored",
      "attached",
    ]);
    expect(rows.every((row) => row.subjectId === evidence.id)).toBe(true);
    expect(rows.every((row) => row.label === "kept note")).toBe(true);
    expect(rows[2]?.toValue).toBe(entity.id);
  });

  it("logs nothing when hide, restore or attach finds no Evidence", async () => {
    const cased = await seedCase(db);
    const base = {
      caseId: cased.id,
      organizationId: TEST_ORGANIZATION_ID,
      evidenceId: "11111111-1111-4111-8111-0000000000ff",
    } as const;
    await expect(
      runDomain(softDeleteEvidenceEffect(base))
    ).rejects.toMatchObject({ _tag: "NotFoundError" });
    await expect(runDomain(restoreEvidenceEffect(base))).rejects.toMatchObject({
      _tag: "NotFoundError",
    });
    await expect(
      runDomain(attachEvidenceEntityEffect({ ...base, entityId: null }))
    ).rejects.toMatchObject({ _tag: "NotFoundError" });
    expect(await log()).toEqual([]);
  });

  it("logs processed once, and nothing for already processed Evidence", async () => {
    const cased = await seedCase(db);
    const evidence = await seedEvidence(db, cased.id, { label: "to process" });
    await forgetSeedActivity();
    const input = { caseId: cased.id, evidenceId: evidence.id } as const;

    await runDomain(markEvidenceProcessedEffect(input));
    await runDomain(markEvidenceProcessedEffect(input));

    const rows = await log();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: "processed",
      subjectId: evidence.id,
      label: "to process",
    });
  });

  it("logs a standalone attestation, and none when the surrounding transaction rolls back", async () => {
    const cased = await seedCase(db);
    const attestation = await runDomain(
      createAttestationEffect({
        caseId: cased.id,
        text: "I saw this",
        actorId: TEST_ACTOR_ID,
      })
    );
    expect((await log()).map((row) => row.subjectId)).toEqual([attestation.id]);

    const failure = new InternalError({ reason: "rollback me" });
    await runDomain(
      transact((tx) =>
        Effect.gen(function* rolledBack() {
          yield* createAttestationEffect({
            caseId: cased.id,
            text: "never committed",
            actorId: TEST_ACTOR_ID,
            tx,
          });
          return yield* failure;
        })
      ).pipe(Effect.flip)
    );
    expect(await log()).toHaveLength(1);
  });

  it("refuses a verb that is not listed for Evidence", async () => {
    const cased = await seedCase(db);
    await expect(
      runDomain(
        appendActivityEffect(db, {
          caseId: cased.id,
          kind: "evidence",
          action: "deleted",
        })
      )
    ).rejects.toMatchObject({ _tag: "InternalError" });
  });
});

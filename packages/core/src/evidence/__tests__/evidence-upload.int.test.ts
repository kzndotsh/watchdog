import { randomUUID } from "node:crypto";

import { Layer } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import {
  blobStoreLayer,
  recordingBlobStore,
  sha256Hex,
} from "@watchdog/core/blob";
import { isDomainTag } from "@watchdog/core/errors";
import {
  confirmFileUploadEffect,
  presignUploadEffect,
} from "@watchdog/core/evidence";
import { Db, runDomainWith } from "@watchdog/core/infra";
import { db, evidenceUploadsRepo } from "@watchdog/db";
import type { CaseId } from "@watchdog/schemas/shared";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import {
  listAllActivity,
  listCaseEvidence,
  resetTestDb,
  seedCase,
} from "@watchdog/test-db";
import { TEST_ACTOR_ID } from "@watchdog/test-kit";

const blob = recordingBlobStore();
const runDomain = runDomainWith(Layer.mergeAll(Db.layer, blob.layer));
const runLive = runDomainWith(Layer.mergeAll(Db.layer, blobStoreLayer));

const BYTES = new TextEncoder().encode("a document an investigator uploaded");
const SHA = sha256Hex(BYTES);
const PNG_HEAD = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function isInvalid(error: unknown): boolean {
  return isDomainTag(error) && error.code === "invalid";
}

async function presign(
  caseId: CaseId,
  declared: { sha256: string; mime: string; byteLength: number },
  run: typeof runDomain = runDomain
) {
  return run(
    presignUploadEffect({
      caseId,
      organizationId: TEST_ORGANIZATION_ID,
      name: "doc.txt",
      actorId: TEST_ACTOR_ID,
      ...declared,
    })
  );
}

describe("verified Evidence uploads (#305)", () => {
  beforeEach(async () => {
    await resetTestDb();
    blob.objects.clear();
  });

  it("records the pending upload when a URL is presigned", async () => {
    const cased = await seedCase(db);
    const put = await presign(cased.id, {
      sha256: SHA,
      mime: "text/plain",
      byteLength: BYTES.byteLength,
    });
    const row = await evidenceUploadsRepo.getByUri(db, cased.id, put.uri);
    expect(row).toMatchObject({
      uri: put.uri,
      declaredSha256: SHA,
      declaredMime: "text/plain",
      declaredByteLength: BYTES.byteLength,
      actorId: TEST_ACTOR_ID,
      confirmedAt: null,
    });
  });

  it("confirms a matching object and stores the hash the server computed", async () => {
    const cased = await seedCase(db);
    const declared = {
      sha256: SHA,
      mime: "text/plain",
      byteLength: BYTES.byteLength,
    };
    const put = await presign(cased.id, declared);
    blob.objects.set(put.uri, BYTES);

    const record = await runDomain(
      confirmFileUploadEffect(
        {
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          uri: put.uri,
          ...declared,
        },
        TEST_ACTOR_ID
      )
    );

    expect(record.sha256).toBe(sha256Hex(BYTES));
    expect(record.uri).toBe(put.uri);
    const upload = await evidenceUploadsRepo.getByUri(db, cased.id, put.uri);
    expect(upload?.confirmedAt).not.toBeNull();
  });

  it("refuses a client hash that is not the hash of the stored bytes, and records nothing", async () => {
    const cased = await seedCase(db);
    const claimed = sha256Hex(new TextEncoder().encode("something else"));
    const declared = {
      sha256: claimed,
      mime: "text/plain",
      byteLength: BYTES.byteLength,
    };
    const put = await presign(cased.id, declared);
    blob.objects.set(put.uri, BYTES);

    await expect(
      runDomain(
        confirmFileUploadEffect(
          {
            caseId: cased.id,
            organizationId: TEST_ORGANIZATION_ID,
            uri: put.uri,
            ...declared,
          },
          TEST_ACTOR_ID
        )
      )
    ).rejects.toSatisfy(isInvalid);

    expect(await listCaseEvidence(db, cased.id)).toEqual([]);
    const upload = await evidenceUploadsRepo.getByUri(db, cased.id, put.uri);
    expect(upload?.confirmedAt).toBeNull();
  });

  it("refuses a stored size that differs from the declared size", async () => {
    const cased = await seedCase(db);
    const declared = {
      sha256: SHA,
      mime: "text/plain",
      byteLength: BYTES.byteLength + 5,
    };
    const put = await presign(cased.id, declared);
    blob.objects.set(put.uri, BYTES);
    await expect(
      runDomain(
        confirmFileUploadEffect(
          {
            caseId: cased.id,
            organizationId: TEST_ORGANIZATION_ID,
            uri: put.uri,
            ...declared,
          },
          TEST_ACTOR_ID
        )
      )
    ).rejects.toSatisfy(isInvalid);
    expect(await listCaseEvidence(db, cased.id)).toEqual([]);
  });

  it("refuses bytes whose content contradicts the declared type", async () => {
    const cased = await seedCase(db);
    const declared = {
      sha256: sha256Hex(PNG_HEAD),
      mime: "application/pdf",
      byteLength: PNG_HEAD.byteLength,
    };
    const put = await presign(cased.id, declared);
    blob.objects.set(put.uri, PNG_HEAD);
    await expect(
      runDomain(
        confirmFileUploadEffect(
          {
            caseId: cased.id,
            organizationId: TEST_ORGANIZATION_ID,
            uri: put.uri,
            ...declared,
          },
          TEST_ACTOR_ID
        )
      )
    ).rejects.toSatisfy(isInvalid);
    expect(await listCaseEvidence(db, cased.id)).toEqual([]);
  });

  it("refuses a confirmation when no object was uploaded", async () => {
    const cased = await seedCase(db);
    const declared = {
      sha256: SHA,
      mime: "text/plain",
      byteLength: BYTES.byteLength,
    };
    const put = await presign(cased.id, declared);
    await expect(
      runDomain(
        confirmFileUploadEffect(
          {
            caseId: cased.id,
            organizationId: TEST_ORGANIZATION_ID,
            uri: put.uri,
            ...declared,
          },
          TEST_ACTOR_ID
        )
      )
    ).rejects.toSatisfy(isInvalid);
    expect(await listCaseEvidence(db, cased.id)).toEqual([]);
  });

  it("refuses a key that was never presigned, even with a matching object in the store", async () => {
    const cased = await seedCase(db);
    const uri = `${cased.id}/${SHA}/unpresigned.txt`;
    blob.objects.set(uri, BYTES);
    await expect(
      runDomain(
        confirmFileUploadEffect(
          {
            caseId: cased.id,
            organizationId: TEST_ORGANIZATION_ID,
            uri,
            sha256: SHA,
            mime: "text/plain",
            byteLength: BYTES.byteLength,
          },
          TEST_ACTOR_ID
        )
      )
    ).rejects.toSatisfy(isInvalid);
  });

  it("refuses a confirmation when a re-presign changes the declaration after it was checked", async () => {
    const cased = await seedCase(db);
    const declared = {
      sha256: SHA,
      mime: "text/plain",
      byteLength: BYTES.byteLength,
    };
    let uri = "";
    // The re-presign lands while the object is being verified: after the declaration was
    // compared, before the confirmation is recorded.
    const racing = recordingBlobStore({
      respond: async ({ command }) => {
        if (command === "HeadObjectCommand") {
          await evidenceUploadsRepo.upsertPresigned(db, {
            caseId: cased.id,
            uri,
            declaredSha256: SHA,
            declaredMime: "application/octet-stream",
            declaredByteLength: BYTES.byteLength,
            actorId: TEST_ACTOR_ID,
          });
        }
        return undefined;
      },
    });
    const runRacing = runDomainWith(Layer.mergeAll(Db.layer, racing.layer));
    const put = await presign(cased.id, declared);
    uri = put.uri;
    racing.objects.set(put.uri, BYTES);
    await expect(
      runRacing(
        confirmFileUploadEffect(
          {
            caseId: cased.id,
            organizationId: TEST_ORGANIZATION_ID,
            uri: put.uri,
            ...declared,
          },
          TEST_ACTOR_ID
        )
      )
    ).rejects.toSatisfy(isInvalid);
    expect(await listCaseEvidence(db, cased.id)).toEqual([]);
  });

  it("makes a repeated identical confirmation idempotent: same Evidence, one row, one activity entry", async () => {
    const cased = await seedCase(db);
    const declared = {
      sha256: SHA,
      mime: "text/plain",
      byteLength: BYTES.byteLength,
    };
    const put = await presign(cased.id, declared);
    blob.objects.set(put.uri, BYTES);
    const confirm = (values: typeof declared = declared) =>
      runDomain(
        confirmFileUploadEffect(
          {
            caseId: cased.id,
            organizationId: TEST_ORGANIZATION_ID,
            uri: put.uri,
            ...values,
          },
          TEST_ACTOR_ID
        )
      );
    const first = await confirm();
    const again = await confirm();
    expect(again.id).toBe(first.id);
    expect(again.sha256).toBe(first.sha256);
    expect(await listCaseEvidence(db, cased.id)).toHaveLength(1);
    const captured = (await listAllActivity()).filter(
      (entry) =>
        entry.kind === "evidence" &&
        entry.action === "captured" &&
        entry.subjectId === first.id
    );
    expect(captured).toHaveLength(1);

    await expect(
      confirm({ ...declared, sha256: "cd".repeat(32) })
    ).rejects.toSatisfy(isInvalid);
    expect(await listCaseEvidence(db, cased.id)).toHaveLength(1);
  });

  it("refuses a confirmation whose values differ from the presigned ones", async () => {
    const cased = await seedCase(db);
    const put = await presign(cased.id, {
      sha256: SHA,
      mime: "text/plain",
      byteLength: BYTES.byteLength,
    });
    blob.objects.set(put.uri, BYTES);
    await expect(
      runDomain(
        confirmFileUploadEffect(
          {
            caseId: cased.id,
            organizationId: TEST_ORGANIZATION_ID,
            uri: put.uri,
            sha256: SHA,
            mime: "application/octet-stream",
            byteLength: BYTES.byteLength,
          },
          TEST_ACTOR_ID
        )
      )
    ).rejects.toSatisfy(isInvalid);
  });

  describe("against the real object store", () => {
    it("accepts the declared size, refuses another size, and verifies what was stored", async () => {
      const cased = await seedCase(db);
      const bytes = new TextEncoder().encode(`live ${randomUUID()}`);
      const declared = {
        sha256: sha256Hex(bytes),
        mime: "text/plain",
        byteLength: bytes.byteLength,
      };
      const put = await presign(cased.id, declared, runLive);

      // A body longer than the signed length is refused by the store itself.
      const oversized = await fetch(put.url, {
        method: "PUT",
        headers: put.headers,
        body: new Uint8Array(bytes.byteLength + 64),
      });
      expect(oversized.ok).toBe(false);

      const ok = await fetch(put.url, {
        method: "PUT",
        headers: put.headers,
        body: bytes,
      });
      expect(ok.ok).toBe(true);

      const record = await runLive(
        confirmFileUploadEffect(
          {
            caseId: cased.id,
            organizationId: TEST_ORGANIZATION_ID,
            uri: put.uri,
            ...declared,
          },
          TEST_ACTOR_ID
        )
      );
      expect(record.sha256).toBe(declared.sha256);
    });

    it("refuses bytes that are not the declared ones", async () => {
      const cased = await seedCase(db);
      const declaredBytes = new TextEncoder().encode(
        `declared ${randomUUID()}`
      );
      const sent = new TextEncoder().encode(`swapped ${randomUUID()}`);
      const declared = {
        sha256: sha256Hex(declaredBytes),
        mime: "text/plain",
        byteLength: sent.byteLength,
      };
      const put = await presign(cased.id, declared, runLive);
      const res = await fetch(put.url, {
        method: "PUT",
        headers: put.headers,
        body: sent,
      });
      expect(res.ok).toBe(true);
      await expect(
        runLive(
          confirmFileUploadEffect(
            {
              caseId: cased.id,
              organizationId: TEST_ORGANIZATION_ID,
              uri: put.uri,
              ...declared,
            },
            TEST_ACTOR_ID
          )
        )
      ).rejects.toSatisfy(isInvalid);
      expect(await listCaseEvidence(db, cased.id)).toEqual([]);
    });
  });
});

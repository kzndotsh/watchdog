import { createHash } from "node:crypto";

import { Layer } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { db, jobsRepo, providerCallsRepo } from "@watchdog/db";
import type { CaseId } from "@watchdog/schemas/shared";
import {
  TEST_ORGANIZATION_ID,
  TEST_OTHER_ORGANIZATION_ID,
} from "@watchdog/schemas/testing";
import {
  resetTestDb,
  seedCase,
  seedEvidence,
  seedJob,
  seedProviderCall,
} from "@watchdog/test-db";

import { recordingBlobStore } from "../../infra/blob-store";
import { Db } from "../../infra/db-service";
import { runDomainWith } from "../../infra/run-domain";
import {
  getProviderCallResponseEffect,
  listEvidenceProviderCallsEffect,
  listJobProviderCallsEffect,
} from "../provider-call-view";

/*
 * The read paths behind Evidence detail and Job detail (#498): the calls of a Job or of one
 * Evidence row, whether the record is whole, and a stored raw response. Every read is scoped to
 * the caller's organization and Case, and the soft references (`served_from_call_id`,
 * `jobs.cache_source_job_id`) are followed only inside that scope.
 */

const store = recordingBlobStore();
const run = runDomainWith(Layer.mergeAll(Db.layer, store.layer));

const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

const seedCall = (
  caseId: CaseId,
  jobId: string,
  options?: Parameters<typeof seedProviderCall>[3]
) => seedProviderCall(db, caseId, jobId, options);

/** A stored response: the body in the object store under the Case's prefix, and its outcome. */
async function seedStoredCall(caseId: CaseId, jobId: string, body: string) {
  const bytes = new TextEncoder().encode(body);
  const hash = sha(bytes);
  const blobKey = `${caseId}/${hash}/provider-response`;
  store.objects.set(blobKey, bytes);
  const call = await seedCall(caseId, jobId, {
    outcome: {
      bodyState: "stored",
      bodyReason: null,
      bodySha256: hash,
      bodyBytes: bytes.byteLength,
      blobKey,
    },
  });
  return { ...call, bytes, hash, blobKey };
}

async function seedCapJob(
  caseId: CaseId,
  patch: Parameters<typeof jobsRepo.update>[2] = {}
) {
  const job = await seedJob(db, caseId, {
    status: "succeeded",
    capabilityId: "network.http.probe",
  });
  const updated = await jobsRepo.update(db, job.id, {
    capVersion: "v-abc123",
    ...patch,
  });
  if (!updated) throw new Error("job missing");
  return updated;
}

let caseId: CaseId;
let otherCaseId: CaseId;
let foreignOrgCaseId: CaseId;

beforeEach(async () => {
  await resetTestDb();
  store.objects.clear();
  caseId = (await seedCase(db)).id;
  otherCaseId = (await seedCase(db)).id;
  foreignOrgCaseId = (
    await seedCase(db, { organizationId: TEST_OTHER_ORGANIZATION_ID })
  ).id;
});

describe("a Job's provider calls", () => {
  it("lists each call with its Cap and version, outcome, timing and body fields", async () => {
    const job = await seedCapJob(caseId);
    const stored = await seedStoredCall(caseId, job.id, "<html>ok</html>");
    await seedCall(caseId, job.id, {
      seq: 1,
      url: "https://provider.test/v1/other",
      outcome: {
        outcome: "failed",
        status: null,
        hops: [],
        responseHeaders: {},
        failureTag: "TransportError",
        failureReason: "timeout",
        bodyState: "none",
        bodyReason: null,
        bodySha256: null,
        bodyBytes: null,
        durationMs: 5000,
      },
    });

    const list = await run(
      listJobProviderCallsEffect(caseId, TEST_ORGANIZATION_ID, job.id)
    );

    expect(list.provenance).toBe("complete");
    expect(list.isTruncated).toBe(false);
    expect(list.cacheHits).toEqual([]);
    expect(list.calls).toHaveLength(2);
    expect(list.calls[0]).toMatchObject({
      id: stored.id,
      jobId: job.id,
      capabilityId: "network.http.probe",
      capVersion: "v-abc123",
      transport: "http",
      method: "GET",
      outcome: "response",
      status: 200,
      hops: 1,
      durationMs: 120,
      isServedFromCache: false,
      original: null,
      body: {
        state: "stored",
        sha256: stored.hash,
        bytes: stored.bytes.byteLength,
        contentType: "text/html; charset=utf-8",
        isDownloadable: true,
      },
    });
    expect(list.calls[1]).toMatchObject({
      outcome: "failed",
      status: null,
      failureTag: "TransportError",
      failureReason: "timeout",
      body: { state: "none", isDownloadable: false },
    });
  });

  it("shows a call with no recorded outcome as one, not as a finished call", async () => {
    const job = await seedCapJob(caseId);
    await seedCall(caseId, job.id, { outcome: null });

    const list = await run(
      listJobProviderCallsEffect(caseId, TEST_ORGANIZATION_ID, job.id)
    );

    expect(list.calls[0]).toMatchObject({ outcome: null, body: null });
  });

  it("reports an incomplete record as incomplete, including when no call was saved", async () => {
    const job = await seedCapJob(caseId, { provenanceState: "incomplete" });

    const list = await run(
      listJobProviderCallsEffect(caseId, TEST_ORGANIZATION_ID, job.id)
    );

    expect(list.calls).toEqual([]);
    expect(list.provenance).toBe("incomplete");
  });

  it("reports a Job with no calls and a whole record as complete", async () => {
    const job = await seedCapJob(caseId);

    const list = await run(
      listJobProviderCallsEffect(caseId, TEST_ORGANIZATION_ID, job.id)
    );

    expect(list).toMatchObject({ calls: [], provenance: "complete" });
  });

  it("names the source Job of a cache hit when it is a Job of the same Case", async () => {
    const source = await seedCapJob(caseId);
    const hit = await seedCapJob(caseId, {
      fromCache: true,
      cacheSourceJobId: source.id,
    });

    const list = await run(
      listJobProviderCallsEffect(caseId, TEST_ORGANIZATION_ID, hit.id)
    );

    expect(list.cacheHits).toEqual([{ jobId: hit.id, sourceJobId: source.id }]);
  });

  it("does not follow a cache source in another Case or organization", async () => {
    const sameOrgOtherCase = await seedCapJob(otherCaseId);
    const otherOrg = await seedCapJob(foreignOrgCaseId);
    const hitA = await seedCapJob(caseId, {
      fromCache: true,
      cacheSourceJobId: sameOrgOtherCase.id,
    });
    const hitB = await seedCapJob(caseId, {
      fromCache: true,
      cacheSourceJobId: otherOrg.id,
    });

    const a = await run(
      listJobProviderCallsEffect(caseId, TEST_ORGANIZATION_ID, hitA.id)
    );
    const b = await run(
      listJobProviderCallsEffect(caseId, TEST_ORGANIZATION_ID, hitB.id)
    );

    expect(a.cacheHits).toEqual([{ jobId: hitA.id, sourceJobId: null }]);
    expect(b.cacheHits).toEqual([{ jobId: hitB.id, sourceJobId: null }]);
    expect(JSON.stringify([a, b])).not.toContain(sameOrgOtherCase.id);
    expect(JSON.stringify([a, b])).not.toContain(otherOrg.id);
  });

  it("follows a served-from call inside the Case and not outside it", async () => {
    const sourceJob = await seedCapJob(caseId);
    const original = await seedCall(caseId, sourceJob.id);
    const foreignJob = await seedCapJob(foreignOrgCaseId);
    const foreignOriginal = await seedCall(foreignOrgCaseId, foreignJob.id);
    const servedJob = await seedCapJob(caseId);
    const served = (servedFromCallId: string, seq: number) =>
      seedCall(caseId, servedJob.id, {
        seq,
        outcome: {
          outcome: "served_from",
          servedFromCallId,
          bodyState: "hashed",
          bodyReason: "served_from",
        },
      });
    await served(original.id, 0);
    await served(foreignOriginal.id, 1);

    const list = await run(
      listJobProviderCallsEffect(caseId, TEST_ORGANIZATION_ID, servedJob.id)
    );

    expect(list.calls.map((call) => call.isServedFromCache)).toEqual([
      true,
      true,
    ]);
    expect(list.calls[0]?.original).toEqual({
      callId: original.id,
      jobId: sourceJob.id,
    });
    expect(list.calls[1]?.original).toBeNull();
    expect(JSON.stringify(list)).not.toContain(foreignOriginal.id);
    expect(JSON.stringify(list)).not.toContain(foreignJob.id);
  });

  it("refuses a Job of another organization's Case, and another Case's Job, as not found", async () => {
    const mine = await seedCapJob(caseId);
    const foreign = await seedCapJob(foreignOrgCaseId);

    await expect(
      run(
        listJobProviderCallsEffect(caseId, TEST_OTHER_ORGANIZATION_ID, mine.id)
      )
    ).rejects.toMatchObject({ _tag: "NotFoundError", entity: "Case" });
    await expect(
      run(
        listJobProviderCallsEffect(
          foreignOrgCaseId,
          TEST_ORGANIZATION_ID,
          foreign.id
        )
      )
    ).rejects.toMatchObject({ _tag: "NotFoundError", entity: "Case" });
    // A Job id of another Case, asked through the caller's own Case.
    await expect(
      run(listJobProviderCallsEffect(caseId, TEST_ORGANIZATION_ID, foreign.id))
    ).rejects.toMatchObject({ _tag: "NotFoundError", entity: "Job" });
  });

  it("never lists another Case's calls under this Job id", async () => {
    const job = await seedCapJob(caseId);
    const foreignJob = await seedCapJob(otherCaseId);
    await seedCall(otherCaseId, foreignJob.id);

    const list = await run(
      listJobProviderCallsEffect(caseId, TEST_ORGANIZATION_ID, job.id)
    );

    expect(list.calls).toEqual([]);
  });
});

describe("the provider calls behind Evidence", () => {
  it("lists the calls linked to the Evidence, with the Cap and version of the Job that made them", async () => {
    const job = await seedCapJob(caseId);
    const evidence = await seedEvidence(db, caseId);
    const call = await seedCall(caseId, job.id);
    await seedCall(caseId, job.id, { seq: 1 });
    await providerCallsRepo.linkEvidence(db, caseId, [evidence.id], [call.id]);

    const list = await run(
      listEvidenceProviderCallsEffect(caseId, TEST_ORGANIZATION_ID, evidence.id)
    );

    expect(list.provenance).toBe("complete");
    expect(list.calls).toHaveLength(1);
    expect(list.calls[0]).toMatchObject({
      id: call.id,
      capabilityId: "network.http.probe",
      capVersion: "v-abc123",
    });
  });

  it("reports incomplete when the Job that made a linked call has a gap", async () => {
    const job = await seedCapJob(caseId, { provenanceState: "incomplete" });
    const evidence = await seedEvidence(db, caseId);
    const call = await seedCall(caseId, job.id);
    await providerCallsRepo.linkEvidence(db, caseId, [evidence.id], [call.id]);

    const list = await run(
      listEvidenceProviderCallsEffect(caseId, TEST_ORGANIZATION_ID, evidence.id)
    );

    expect(list.provenance).toBe("incomplete");
  });

  it("reports incomplete for Evidence a gap-marked Job landed that has no linked call", async () => {
    const evidence = await seedEvidence(db, caseId);
    await seedCapJob(caseId, {
      provenanceState: "incomplete",
      evidenceIds: [evidence.id],
    });

    const list = await run(
      listEvidenceProviderCallsEffect(caseId, TEST_ORGANIZATION_ID, evidence.id)
    );

    expect(list.calls).toEqual([]);
    expect(list.provenance).toBe("incomplete");
  });

  it("names the cached Job and its source for Evidence a cache hit landed", async () => {
    const source = await seedCapJob(caseId);
    const evidence = await seedEvidence(db, caseId);
    const call = await seedCall(caseId, source.id);
    await providerCallsRepo.linkEvidence(db, caseId, [evidence.id], [call.id]);
    const hit = await seedCapJob(caseId, {
      fromCache: true,
      cacheSourceJobId: source.id,
      evidenceIds: [evidence.id],
    });

    const list = await run(
      listEvidenceProviderCallsEffect(caseId, TEST_ORGANIZATION_ID, evidence.id)
    );

    expect(list.calls.map((c) => c.jobId)).toEqual([source.id]);
    expect(list.cacheHits).toEqual([{ jobId: hit.id, sourceJobId: source.id }]);
  });

  it("does not follow a cache source outside the Case for Evidence a hit landed", async () => {
    const foreignSource = await seedCapJob(foreignOrgCaseId);
    const evidence = await seedEvidence(db, caseId);
    const hit = await seedCapJob(caseId, {
      fromCache: true,
      cacheSourceJobId: foreignSource.id,
      evidenceIds: [evidence.id],
    });

    const list = await run(
      listEvidenceProviderCallsEffect(caseId, TEST_ORGANIZATION_ID, evidence.id)
    );

    expect(list.cacheHits).toEqual([{ jobId: hit.id, sourceJobId: null }]);
    expect(JSON.stringify(list)).not.toContain(foreignSource.id);
  });

  it("refuses Evidence of another organization or another Case as not found", async () => {
    const mine = await seedEvidence(db, caseId);
    const foreign = await seedEvidence(db, foreignOrgCaseId);

    await expect(
      run(
        listEvidenceProviderCallsEffect(
          caseId,
          TEST_OTHER_ORGANIZATION_ID,
          mine.id
        )
      )
    ).rejects.toMatchObject({ _tag: "NotFoundError", entity: "Case" });
    await expect(
      run(
        listEvidenceProviderCallsEffect(
          caseId,
          TEST_ORGANIZATION_ID,
          foreign.id
        )
      )
    ).rejects.toMatchObject({ _tag: "NotFoundError", entity: "Evidence" });
  });
});

describe("a stored raw response", () => {
  it("is returned with its hash and the provider's content type", async () => {
    const job = await seedCapJob(caseId);
    const stored = await seedStoredCall(caseId, job.id, "<script>x</script>");

    const response = await run(
      getProviderCallResponseEffect(caseId, TEST_ORGANIZATION_ID, stored.id)
    );

    expect(new TextDecoder().decode(response.bytes)).toBe("<script>x</script>");
    expect(response.sha256).toBe(stored.hash);
    expect(response.providerContentType).toBe("text/html; charset=utf-8");
  });

  it("is not found when the body was only hashed, or the call has no outcome", async () => {
    const job = await seedCapJob(caseId);
    const hashed = await seedCall(caseId, job.id);
    const open = await seedCall(caseId, job.id, { seq: 1, outcome: null });

    await Promise.all(
      [hashed, open].map(async (call) =>
        expect(
          run(
            getProviderCallResponseEffect(caseId, TEST_ORGANIZATION_ID, call.id)
          )
        ).rejects.toMatchObject({
          _tag: "NotFoundError",
          entity: "Provider call",
        })
      )
    );
  });

  it("is not found for a call of another Case or another organization", async () => {
    const foreignJob = await seedCapJob(foreignOrgCaseId);
    const foreign = await seedStoredCall(foreignOrgCaseId, foreignJob.id, "x");
    const otherCaseJob = await seedCapJob(otherCaseId);
    const sibling = await seedStoredCall(otherCaseId, otherCaseJob.id, "y");
    const mineJob = await seedCapJob(caseId);
    const mine = await seedStoredCall(caseId, mineJob.id, "z");

    // The call's own Case, but not the caller's organization.
    await expect(
      run(
        getProviderCallResponseEffect(
          foreignOrgCaseId,
          TEST_ORGANIZATION_ID,
          foreign.id
        )
      )
    ).rejects.toMatchObject({ _tag: "NotFoundError", entity: "Case" });
    // The caller's organization asking for a call through a Case it does not own.
    await expect(
      run(
        getProviderCallResponseEffect(
          caseId,
          TEST_OTHER_ORGANIZATION_ID,
          mine.id
        )
      )
    ).rejects.toMatchObject({ _tag: "NotFoundError" });
    // A call id of another Case, asked through the caller's Case.
    await Promise.all(
      [foreign, sibling].map(async (call) =>
        expect(
          run(
            getProviderCallResponseEffect(caseId, TEST_ORGANIZATION_ID, call.id)
          )
        ).rejects.toMatchObject({
          _tag: "NotFoundError",
          entity: "Provider call",
        })
      )
    );
  });

  it("is never served when the stored bytes no longer match the recorded hash", async () => {
    const job = await seedCapJob(caseId);
    const stored = await seedStoredCall(caseId, job.id, "original");
    store.objects.set(stored.blobKey, new TextEncoder().encode("tampered"));

    await expect(
      run(
        getProviderCallResponseEffect(caseId, TEST_ORGANIZATION_ID, stored.id)
      )
    ).rejects.toMatchObject({
      _tag: "InternalError",
      reason: "Failed to read the response",
    });
  });
});

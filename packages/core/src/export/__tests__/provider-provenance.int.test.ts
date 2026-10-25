import { createHash, randomUUID } from "node:crypto";

import { Layer } from "effect";
import { strFromU8, unzipSync } from "fflate";
import { beforeEach, describe, expect, it } from "vitest";

import {
  db,
  evidenceRepo,
  providerCallsRepo,
  type EvidenceRow,
} from "@watchdog/db";
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
  seedOrganizationMember,
  seedProviderCall,
} from "@watchdog/test-db";

import { recordingBlobStore } from "../../infra/blob-store";
import { Db } from "../../infra/db-service";
import { runDomainWith } from "../../infra/run-domain";
import {
  measureCaseExportEffect,
  writeCaseExportZipEffect,
} from "../case-export";
import {
  RAW_BODY_WITHHELD,
  type CaseExportOptions,
} from "../provider-body-policy";
import type { CaseExportSettings } from "../settings";
import type { ZipSink } from "../zip-writer";

/*
 * What the Export carries of the provider calls behind its Evidence (#499): an envelope per
 * call, attribution and verification notes always, and a raw response only when an owner or
 * admin opted in, the host's terms allow it, the Cap is not a breach Cap and the host is not one
 * the input named.
 */

const store = recordingBlobStore();
const run = runDomainWith(Layer.mergeAll(Db.layer, store.layer));

const SETTINGS: CaseExportSettings = {
  inlineMaxBytes: 100 * 1024 * 1024,
  linkTtlMs: 60_000,
  concurrency: 3,
};

/** A fixed-host Cap (api.abuseipdb.com), a Cap that fetches the host its input names, one that does both, and a breach Cap. */
const FIXED_CAP = "threat.abuseipdb.lookup";
const FIXED_URL = "https://api.abuseipdb.com/api/v2/check?key=[redacted]";
const TARGET_CAP = "web.page.enrich";
const MIXED_CAP = "network.url.enrich";
const BREACH_CAP = "breach.hibp.lookup";
const CREDIT_CAP = "network.censys.lookup";

const ALLOW_ALL: CaseExportOptions = {
  shouldIncludeRawBodies: true,
  redistributionVerdictFor: () => "allowed",
};
const OPTED_IN_REAL_REGISTER: CaseExportOptions = {
  shouldIncludeRawBodies: true,
};
const NOT_OPTED_IN: CaseExportOptions = {
  shouldIncludeRawBodies: false,
  redistributionVerdictFor: () => "allowed",
};

function collectingSink(): ZipSink & { archive: () => Uint8Array } {
  const chunks: Uint8Array[] = [];
  return {
    write: (chunk) => {
      chunks.push(chunk);
      return Promise.resolve();
    },
    end: () => Promise.resolve(),
    archive: () => Buffer.concat(chunks),
  };
}

type Envelope = {
  id: string;
  capabilityId: string;
  url: string;
  evidenceIds: string[];
  isServedFromCache: boolean;
  original: { callId: string; jobId: string } | null;
  jobProvenance: string;
  body: { sha256: string | null; bytes: number | null } | null;
  rawBody:
    | { status: "included"; path: string }
    | { status: "withheld"; reason: string; explanation: string };
};

function text(files: Record<string, Uint8Array>, name: string): string {
  const bytes = files[name];
  if (bytes === undefined) throw new Error(`missing ${name} in the archive`);
  return strFromU8(bytes);
}

async function exportCase(
  caseId: CaseId,
  slug: string,
  options: CaseExportOptions
) {
  const sink = collectingSink();
  await run(writeCaseExportZipEffect(caseId, sink, SETTINGS, options));
  const files = unzipSync(sink.archive());
  const jsonl = files[`${slug}/provider-calls.jsonl`];
  const envelopes: Envelope[] =
    jsonl === undefined
      ? []
      : strFromU8(jsonl)
          .split("\n")
          .filter((line) => line !== "")
          .map((line) => JSON.parse(line) as Envelope);
  const byId = new Map(envelopes.map((e) => [e.id, e]));
  return { files, envelopes, byId, text: (name: string) => text(files, name) };
}

type SeededCall = {
  id: string;
  body: Uint8Array;
  sha256: string;
};

/** A call of `capabilityId` with a stored body, backing `evidence`. */
async function seedBackedCall(
  caseId: CaseId,
  evidence: readonly EvidenceRow[],
  opts: { capabilityId?: string; url?: string; body?: string } = {}
): Promise<SeededCall> {
  const job = await seedJob(db, caseId, {
    status: "succeeded",
    capabilityId: opts.capabilityId ?? FIXED_CAP,
  });
  const body = new TextEncoder().encode(opts.body ?? `body of ${randomUUID()}`);
  const sha256 = createHash("sha256").update(body).digest("hex");
  const blobKey = `${caseId}/${sha256}/provider-response`;
  store.objects.set(blobKey, body);
  const call = await seedProviderCall(db, caseId, job.id, {
    url: opts.url ?? FIXED_URL,
    outcome: {
      bodyState: "stored",
      bodyReason: null,
      bodySha256: sha256,
      bodyBytes: body.byteLength,
      blobKey,
    },
  });
  await providerCallsRepo.linkEvidence(
    db,
    caseId,
    evidence.map((row) => row.id),
    [call.id]
  );
  return { id: call.id, body, sha256 };
}

let caseId: CaseId;
let slug: string;
let evidenceA: EvidenceRow;

beforeEach(async () => {
  await resetTestDb();
  store.objects.clear();
  const cased = await seedCase(db, { name: "Provenance export" });
  caseId = cased.id;
  slug = cased.slug;
  evidenceA = await seedEvidence(db, caseId, { text: "a" });
});

describe("provider-calls.jsonl", () => {
  it("has an envelope for every call that backs an exported Evidence item, with the Evidence ids, and none for deleted Evidence", async () => {
    const evidenceB = await seedEvidence(db, caseId, { text: "b" });
    const evidenceC = await seedEvidence(db, caseId, { text: "c" });
    const deleted = await seedEvidence(db, caseId, { text: "gone" });
    const shared = await seedBackedCall(caseId, [evidenceA, evidenceB]);
    const onlyA = await seedBackedCall(caseId, [evidenceA]);
    const onlyC = await seedBackedCall(caseId, [evidenceC]);
    const onlyDeleted = await seedBackedCall(caseId, [deleted]);
    await evidenceRepo.softDelete(db, caseId, deleted.id);

    const out = await exportCase(caseId, slug, NOT_OPTED_IN);

    expect(out.envelopes.map((e) => e.id).sort()).toEqual(
      [shared.id, onlyA.id, onlyC.id].sort()
    );
    expect(out.byId.has(onlyDeleted.id)).toBe(false);
    expect(out.byId.get(shared.id)?.evidenceIds.sort()).toEqual(
      [evidenceA.id, evidenceB.id].sort()
    );
    // Every exported Evidence item is backed by at least one envelope.
    for (const evidence of [evidenceA, evidenceB, evidenceC]) {
      expect(
        out.envelopes.some((e) => e.evidenceIds.includes(evidence.id))
      ).toBe(true);
    }
    expect(out.byId.get(onlyA.id)).toMatchObject({
      capabilityId: FIXED_CAP,
      url: FIXED_URL,
      jobProvenance: "complete",
      body: { sha256: onlyA.sha256, bytes: onlyA.body.byteLength },
    });
  });

  it("is present, empty, for a Case with no provider calls", async () => {
    const out = await exportCase(caseId, slug, NOT_OPTED_IN);
    expect(out.files[`${slug}/provider-calls.jsonl`]?.byteLength).toBe(0);
  });

  it("does not follow a served-from reference to a call outside the Case", async () => {
    const otherCase = await seedCase(db, {
      organizationId: TEST_OTHER_ORGANIZATION_ID,
    });
    const foreignJob = await seedJob(db, otherCase.id, { status: "succeeded" });
    const foreign = await seedProviderCall(db, otherCase.id, foreignJob.id);
    const original = await seedBackedCall(caseId, [evidenceA]);
    const job = await seedJob(db, caseId, {
      status: "succeeded",
      capabilityId: FIXED_CAP,
    });
    const servedForeign = await seedProviderCall(db, caseId, job.id, {
      outcome: {
        outcome: "served_from",
        servedFromCallId: foreign.id,
        bodyState: "hashed",
        bodyReason: "served_from",
      },
    });
    const servedInCase = await seedProviderCall(db, caseId, job.id, {
      seq: 1,
      outcome: {
        outcome: "served_from",
        servedFromCallId: original.id,
        bodyState: "hashed",
        bodyReason: "served_from",
      },
    });
    await providerCallsRepo.linkEvidence(
      db,
      caseId,
      [evidenceA.id],
      [servedForeign.id, servedInCase.id]
    );

    const out = await exportCase(caseId, slug, NOT_OPTED_IN);

    const foreignLine = out.byId.get(servedForeign.id);
    expect(foreignLine).toMatchObject({
      isServedFromCache: true,
      original: null,
    });
    // The foreign id appears nowhere in the archive.
    expect(JSON.stringify(out.envelopes)).not.toContain(foreign.id);
    expect(out.byId.get(servedInCase.id)).toMatchObject({
      isServedFromCache: true,
      original: { callId: original.id },
    });
  });
});

describe("raw response bodies", () => {
  it("includes a body when opted in, the host's verdict allows it, and the Cap fetches a fixed host", async () => {
    const call = await seedBackedCall(caseId, [evidenceA]);

    const out = await exportCase(caseId, slug, ALLOW_ALL);

    const line = out.byId.get(call.id);
    expect(line?.rawBody).toEqual({
      status: "included",
      path: `provider-responses/${call.id}.bin`,
    });
    const file = out.files[`${slug}/provider-responses/${call.id}.bin`];
    expect(file).toEqual(call.body);
    expect(
      createHash("sha256")
        .update(file ?? new Uint8Array())
        .digest("hex")
    ).toBe(line?.body?.sha256);
  });

  it("withholds every body, with its hash and a fixed reason, when nobody opted in", async () => {
    const call = await seedBackedCall(caseId, [evidenceA]);

    const out = await exportCase(caseId, slug, NOT_OPTED_IN);

    expect(out.byId.get(call.id)).toMatchObject({
      body: { sha256: call.sha256 },
      rawBody: {
        status: "withheld",
        reason: "not_opted_in",
        explanation: RAW_BODY_WITHHELD.not_opted_in,
      },
    });
    expect(
      Object.keys(out.files).some((n) => n.includes("provider-responses"))
    ).toBe(false);
  });

  it("withholds a body whose host verdict is unknown, even with opt-in, and keeps its hash", async () => {
    const call = await seedBackedCall(caseId, [evidenceA]);

    const out = await exportCase(caseId, slug, OPTED_IN_REAL_REGISTER);

    expect(out.byId.get(call.id)).toMatchObject({
      body: { sha256: call.sha256, bytes: call.body.byteLength },
      rawBody: {
        status: "withheld",
        reason: "redistribution_unknown",
        explanation: RAW_BODY_WITHHELD.redistribution_unknown,
      },
    });
    expect(
      out.files[`${slug}/provider-responses/${call.id}.bin`]
    ).toBeUndefined();
  });

  it("withholds a body whose host verdict is forbidden", async () => {
    const call = await seedBackedCall(caseId, [evidenceA]);

    const out = await exportCase(caseId, slug, {
      shouldIncludeRawBodies: true,
      redistributionVerdictFor: () => "forbidden",
    });

    expect(out.byId.get(call.id)?.rawBody).toMatchObject({
      status: "withheld",
      reason: "redistribution_forbidden",
    });
  });

  it("withholds a breach Cap's body even when opted in and every verdict allows it", async () => {
    const call = await seedBackedCall(caseId, [evidenceA], {
      capabilityId: BREACH_CAP,
      url: "https://haveibeenpwned.com/api/v3/breachedaccount/x",
    });

    const out = await exportCase(caseId, slug, ALLOW_ALL);

    expect(out.byId.get(call.id)).toMatchObject({
      body: { sha256: call.sha256 },
      rawBody: { status: "withheld", reason: "breach" },
    });
    expect(
      out.files[`${slug}/provider-responses/${call.id}.bin`]
    ).toBeUndefined();
  });

  it("withholds a body that came from a user target, and from a Cap that could have fetched one", async () => {
    const target = await seedBackedCall(caseId, [evidenceA], {
      capabilityId: TARGET_CAP,
      url: "https://suspect.example/page",
    });
    // `network.url.enrich` declares a fixed host and a target: the host cannot be trusted as fixed.
    const mixed = await seedBackedCall(caseId, [evidenceA], {
      capabilityId: MIXED_CAP,
      url: "https://web.archive.org/web/2020/https://suspect.example/",
    });

    const out = await exportCase(caseId, slug, ALLOW_ALL);

    expect(out.byId.get(target.id)?.rawBody).toMatchObject({
      status: "withheld",
      reason: "target",
    });
    expect(out.byId.get(mixed.id)?.rawBody).toMatchObject({
      status: "withheld",
      reason: "target",
    });
    expect(
      Object.keys(out.files).some((n) => n.includes("provider-responses"))
    ).toBe(false);
  });

  it("leaves out a body that no longer matches its hash, says so, and still finishes the export", async () => {
    const call = await seedBackedCall(caseId, [evidenceA]);
    store.objects.set(
      `${caseId}/${call.sha256}/provider-response`,
      new TextEncoder().encode("tampered")
    );

    const out = await exportCase(caseId, slug, ALLOW_ALL);

    expect(out.byId.get(call.id)).toMatchObject({
      body: { sha256: call.sha256 },
      rawBody: { status: "withheld", reason: "unreadable" },
    });
    expect(
      out.files[`${slug}/provider-responses/${call.id}.bin`]
    ).toBeUndefined();
  });
});

describe("ATTRIBUTION.md and VERIFY.md", () => {
  it("are always in the archive, even with no calls and no opt-in", async () => {
    const out = await exportCase(caseId, slug, NOT_OPTED_IN);

    expect(out.text(`${slug}/ATTRIBUTION.md`)).toContain(
      "No third-party provider data is present"
    );
    const verify = out.text(`${slug}/VERIFY.md`);
    expect(verify).toContain("sha256sum");
    expect(verify).toContain("unchanged since Watchdog received it");
    expect(verify).toContain(
      "does not prove what the provider sent on the wire"
    );
  });

  it("credits the provider of every Cap whose data is present, and no other", async () => {
    await seedBackedCall(caseId, [evidenceA], {
      capabilityId: CREDIT_CAP,
      url: "https://search.censys.io/api/v2/hosts/1.1.1.1",
    });

    const out = await exportCase(caseId, slug, NOT_OPTED_IN);

    const attribution = out.text(`${slug}/ATTRIBUTION.md`);
    expect(attribution).toContain("Censys");
    expect(attribution).toContain("Data from Censys");
    expect(attribution).not.toContain("AbuseIPDB");
  });
});

describe("size of the export", () => {
  const SMALL: CaseExportSettings = { ...SETTINGS, inlineMaxBytes: 500 };

  it("counts raw bodies that would be included toward the inline limit, and only those", async () => {
    await seedBackedCall(caseId, [evidenceA], { body: "x".repeat(600) });
    const measure = (options: CaseExportOptions) =>
      run(
        measureCaseExportEffect(caseId, TEST_ORGANIZATION_ID, SMALL, options)
      );

    expect(await measure(NOT_OPTED_IN)).toMatchObject({
      overLimit: false,
      rawBodyBytes: 0,
    });
    // Opted in, but the real register withholds the body, so it adds nothing.
    expect(await measure(OPTED_IN_REAL_REGISTER)).toMatchObject({
      overLimit: false,
      rawBodyBytes: 0,
    });
    expect(await measure(ALLOW_ALL)).toMatchObject({
      overLimit: true,
      rawBodyBytes: 600,
    });
  });
});

describe("opt-in gate", () => {
  it("is exercised by the owner and admin roles only", async () => {
    // Imported late: the gate reads the member table seeded here.
    const { requireRawBodyOptInEffect } = await import("../raw-body-opt-in");
    for (const [userId, role] of [
      ["opt-in-owner", "owner"],
      ["opt-in-admin", "admin"],
      ["opt-in-member", "member"],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop -- seeds are independent rows, one per role
      await seedOrganizationMember(db, {
        organizationId: TEST_ORGANIZATION_ID,
        userId,
        role,
      });
    }
    const gate = (actorId: string, viaApiKey: boolean) =>
      run(
        requireRawBodyOptInEffect({
          organizationId: TEST_ORGANIZATION_ID,
          actorId,
          viaApiKey,
        })
      );

    await expect(gate("opt-in-owner", false)).resolves.toBeUndefined();
    await expect(gate("opt-in-admin", false)).resolves.toBeUndefined();
    await expect(gate("opt-in-member", false)).rejects.toMatchObject({
      _tag: "ForbiddenError",
    });
    // A key acts as its owner, yet never opts in.
    await expect(gate("opt-in-owner", true)).rejects.toMatchObject({
      _tag: "ForbiddenError",
    });
    await expect(gate("someone-outside", false)).rejects.toMatchObject({
      _tag: "ForbiddenError",
    });
  });
});

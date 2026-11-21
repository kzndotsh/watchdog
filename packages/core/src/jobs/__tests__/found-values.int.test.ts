import { randomUUID } from "node:crypto";

import { Layer } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { jobsRepo } from "@watchdog/db";
import { REPORT_JSON_ARTIFACT } from "@watchdog/domain/schemas/jobs";
import type { CaseId } from "@watchdog/domain/schemas/shared";
import {
  TEST_ORGANIZATION_ID,
  TEST_OTHER_ORGANIZATION_ID,
} from "@watchdog/domain/schemas/testing";
import { testId } from "@watchdog/domain/test-kit";
import {
  resetTestDb,
  seedCase,
  seedEntity,
  seedIdentifier,
  seedJob,
  testDb as db,
} from "@watchdog/test-db";

import { recordingBlobStore } from "../../infra/blob-store";
import { Db } from "../../infra/db-service";
import { runDomainWith } from "../../infra/run-domain";
import { listJobFoundValuesEffect, mergeFoundValues } from "../found-values";

/*
 * The Found tab's read (`jobs.listFound`): every value the Job's report holds, through its
 * Cap's `found` reader, with the Case's Entities that already hold each one.
 */

const store = recordingBlobStore();
const run = runDomainWith(Layer.mergeAll(Db.layer, store.layer));

const DNS_REPORT = {
  host: "acme.test",
  a: ["192.0.2.1", "192.0.2.2"],
  aaaa: [],
  mx: [{ priority: 10, exchange: "mx1.mail.test" }],
  txt: [],
  ns: ["ns1.dns.test", "mx1.mail.test"],
};

/** A succeeded Job of `capabilityId` whose `report.json` holds `report`. */
async function seedJobWithReport(
  caseId: CaseId,
  capabilityId: string,
  report: unknown
) {
  const job = await seedJob(db, caseId, {
    status: "succeeded",
    capabilityId,
    transitions: ["succeeded"],
  });
  const uri = `${caseId}/${randomUUID()}/${REPORT_JSON_ARTIFACT}`;
  store.objects.set(uri, new TextEncoder().encode(JSON.stringify(report)));
  await jobsRepo.update(db, job.id, {
    output: [
      {
        name: REPORT_JSON_ARTIFACT,
        mime: "application/json",
        uri,
        sha256: "a".repeat(64),
      },
    ],
  });
  return job;
}

let caseId: CaseId;

beforeEach(async () => {
  await resetTestDb();
  store.objects.clear();
  caseId = (await seedCase(db)).id;
});

describe("listJobFoundValuesEffect", () => {
  it("lists every value of the report once, with all its sources and who holds it", async () => {
    const alice = await seedEntity(db, caseId, {
      id: testId(11),
      name: "Alice",
      slug: "alice",
    });
    await seedIdentifier(db, alice.id, {
      type: "ip",
      value: "192.0.2.2",
      confidence: "unverified",
    });
    const job = await seedJobWithReport(
      caseId,
      "network.dns.lookup",
      DNS_REPORT
    );

    const found = await run(
      listJobFoundValuesEffect(caseId, TEST_ORGANIZATION_ID, job.id)
    );

    expect(found.hasReader).toBe(true);
    expect(found.total).toBe(4);
    expect(found.isTruncated).toBe(false);
    expect(
      found.values.map((v) => [
        v.value,
        v.sources,
        v.onEntities.map((e) => e.name),
      ])
    ).toEqual([
      ["192.0.2.1", ["A record"], []],
      ["192.0.2.2", ["A record"], ["Alice"]],
      ["ns1.dns.test", ["NS record"], []],
      ["mx1.mail.test", ["NS record", "MX record"], []],
    ]);
  });

  it("says there is no reader for a Cap without one", async () => {
    const job = await seedJobWithReport(caseId, "network.whois.lookup", {});
    const found = await run(
      listJobFoundValuesEffect(caseId, TEST_ORGANIZATION_ID, job.id)
    );
    expect(found).toEqual({
      hasReader: false,
      values: [],
      total: 0,
      isTruncated: false,
    });
  });

  it("refuses a Job of another organization's Case", async () => {
    const foreignCaseId = (
      await seedCase(db, { organizationId: TEST_OTHER_ORGANIZATION_ID })
    ).id;
    const job = await seedJobWithReport(
      foreignCaseId,
      "network.dns.lookup",
      DNS_REPORT
    );
    await expect(
      run(listJobFoundValuesEffect(foreignCaseId, TEST_ORGANIZATION_ID, job.id))
    ).rejects.toMatchObject({ _tag: "NotFoundError" });
  });
});

describe("mergeFoundValues", () => {
  it("cuts the list at the maximum and counts the rest", () => {
    const found = Array.from({ length: 5 }, (_, i) => ({
      type: "domain" as const,
      value: `h${i}.acme.test`,
      source: "Certificate name",
    }));
    const merged = mergeFoundValues(found, [], 3);
    expect(merged.values).toHaveLength(3);
    expect(merged.total).toBe(5);
    expect(merged.isTruncated).toBe(true);
  });
});

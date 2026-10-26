import { Effect } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import {
  dumpUrlEffect,
  listEvidenceEffect,
  softDeleteEvidenceEffect,
} from "@watchdog/core/evidence";
import { runDomain } from "@watchdog/core/infra";
import { evidenceList } from "@watchdog/schemas/evidence";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import { resetTestDb, seedCase, testDb } from "@watchdog/test-db";
import { TEST_ACTOR_ID } from "@watchdog/test-kit";

describe("evidence procedures (core services)", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("dumps a URL and lists it for the case", async () => {
    const cased = await seedCase(testDb);
    const dumped = await runDomain(
      dumpUrlEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        actorId: TEST_ACTOR_ID,
        actorLabel: TEST_ACTOR_ID,
        sourceUrl: "https://example.com/note",
        label: "example note",
      })
    );
    expect(dumped.sourceUrl).toBe("https://example.com/note");

    const listed = await runDomain(
      listEvidenceEffect(
        cased.id,
        TEST_ORGANIZATION_ID,
        evidenceList.input.parse({ caseId: cased.id })
      ).pipe(Effect.map((page) => page.items))
    );
    expect(listed.some((row) => row.id === dumped.id)).toBe(true);
  });

  it("omits hidden evidence from the default list", async () => {
    const cased = await seedCase(testDb);
    const dumped = await runDomain(
      dumpUrlEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        actorId: TEST_ACTOR_ID,
        actorLabel: TEST_ACTOR_ID,
        sourceUrl: "https://example.com/hidden",
      })
    );
    await runDomain(
      softDeleteEvidenceEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        evidenceId: dumped.id,
      })
    );

    const listed = await runDomain(
      listEvidenceEffect(
        cased.id,
        TEST_ORGANIZATION_ID,
        evidenceList.input.parse({ caseId: cased.id })
      ).pipe(Effect.map((page) => page.items))
    );
    expect(listed.some((row) => row.id === dumped.id)).toBe(false);

    const hidden = await runDomain(
      listEvidenceEffect(
        cased.id,
        TEST_ORGANIZATION_ID,
        evidenceList.input.parse({ caseId: cased.id, hidden: true })
      ).pipe(Effect.map((page) => page.items))
    );
    expect(hidden.some((row) => row.id === dumped.id)).toBe(true);
  });
});

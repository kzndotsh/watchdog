import { beforeEach, describe, expect, it } from "vitest";

import {
  dumpUrlEffect,
  listEvidenceForCaseEffect,
  softDeleteEvidenceEffect,
  runDomain,
} from "@watchdog/core";
import { TEST_ACTOR_ID } from "@watchdog/test-kit";
import { resetTestDb, seedCase, testDb } from "@watchdog/test-kit/db";

describe("evidence procedures (core services)", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("dumps a URL and lists it for the case", async () => {
    const cased = await seedCase(testDb);
    const dumped = await runDomain(
      dumpUrlEffect({
        caseId: cased.id,
        actorId: TEST_ACTOR_ID,
        actorLabel: TEST_ACTOR_ID,
        sourceUrl: "https://example.com/note",
        label: "example note",
      })
    );
    expect(dumped.sourceUrl).toBe("https://example.com/note");

    const listed = await runDomain(listEvidenceForCaseEffect(cased.id));
    expect(listed.some((row) => row.id === dumped.id)).toBe(true);
  });

  it("omits hidden evidence from the default list", async () => {
    const cased = await seedCase(testDb);
    const dumped = await runDomain(
      dumpUrlEffect({
        caseId: cased.id,
        actorId: TEST_ACTOR_ID,
        actorLabel: TEST_ACTOR_ID,
        sourceUrl: "https://example.com/hidden",
      })
    );
    await runDomain(
      softDeleteEvidenceEffect({
        caseId: cased.id,
        evidenceId: dumped.id,
      })
    );

    const listed = await runDomain(listEvidenceForCaseEffect(cased.id));
    expect(listed.some((row) => row.id === dumped.id)).toBe(false);

    const hidden = await runDomain(
      listEvidenceForCaseEffect(cased.id, { hiddenOnly: true })
    );
    expect(hidden.some((row) => row.id === dumped.id)).toBe(true);
  });
});

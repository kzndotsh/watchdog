import { beforeEach, describe, expect, it } from "vitest";

import { TEST_ORGANIZATION_ID } from "@watchdog/test-kit";

import {
  createEntityEffect,
  listQuestionsForEntityEffect,
  runDomain
} from "@watchdog/core";
import { db } from "@watchdog/db";
import { resetTestDb, seedCase } from "@watchdog/test-kit/db";

describe("createEntity", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("seeds default questions for a person in the same transaction", async () => {
    const cased = await seedCase(db);
    const person = await runDomain(createEntityEffect({
      caseId: cased.id,
      organizationId: TEST_ORGANIZATION_ID,
      kind: "person",
      name: "Ada Lovelace",
      slug: "ada-lovelace",
    }));
    const questions = await runDomain(
      listQuestionsForEntityEffect(cased.id, TEST_ORGANIZATION_ID, person.id)
    );
    expect(questions.length).toBeGreaterThan(0);
    expect(questions.every((q) => q.status === "open")).toBe(true);
  });

  it("does not seed questions for an org", async () => {
    const cased = await seedCase(db);
    const org = await runDomain(createEntityEffect({
      caseId: cased.id,
      organizationId: TEST_ORGANIZATION_ID,
      kind: "org",
      name: "Analytic Engine",
      slug: "analytic-engine",
    }));
    const questions = await runDomain(
      listQuestionsForEntityEffect(cased.id, TEST_ORGANIZATION_ID, org.id)
    );
    expect(questions).toHaveLength(0);
  });
});

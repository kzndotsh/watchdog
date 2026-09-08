import { beforeEach, describe, expect, it } from "vitest";

import {
  createEntityEffect,
  createEdgeEffect,
  deleteEntityEffect,
  DomainError,
  getEntityByCaseSlugEffect,
  listEntitiesForCaseEffect,
  listQuestionsForEntityEffect,
  runDomain,
  updateEntityFieldsEffect,
} from "@watchdog/core";
import { db } from "@watchdog/db";
import { TEST_ORGANIZATION_ID } from "@watchdog/test-kit";
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

  it("normalizes padded slug on create", async () => {
    const cased = await seedCase(db);
    const entity = await runDomain(
      createEntityEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        kind: "person",
        name: "Slug Pad",
        slug: "  slug-pad  ",
      })
    );
    expect(entity.slug).toBe("slug-pad");
  });

  it("rejects whitespace-only entity name", async () => {
    const cased = await seedCase(db);
    await expect(
      runDomain(
        createEntityEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          kind: "person",
          name: "   ",
          slug: "blank-name",
        })
      )
    ).rejects.toSatisfy(
      (error: unknown) => DomainError.is(error) && error.code === "invalid"
    );
  });
});

describe("updateEntityFields", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("rejects kind changes that invalidate existing edges", async () => {
    const cased = await seedCase(db);
    const org = await runDomain(
      createEntityEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        kind: "org",
        name: "Acme Corp",
        slug: "acme-corp",
      })
    );
    const infra = await runDomain(
      createEntityEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        kind: "infra",
        name: "acme.example",
        slug: "acme-example",
      })
    );
    await runDomain(
      createEdgeEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        fromId: org.id,
        toId: infra.id,
        predicate: "primary_domain",
        confidence: "unverified",
      })
    );

    await expect(
      runDomain(
        updateEntityFieldsEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          entityId: org.id,
          kind: "person",
        })
      )
    ).rejects.toSatisfy(
      (error: unknown) => DomainError.is(error) && error.code === "invalid"
    );
  });
});

describe("getEntityByCaseSlug", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("accepts a padded slug", async () => {
    const cased = await seedCase(db);
    await runDomain(
      createEntityEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        kind: "person",
        name: "Lookup Pad",
        slug: "lookup-pad",
      })
    );
    const row = await runDomain(
      getEntityByCaseSlugEffect(
        cased.id,
        TEST_ORGANIZATION_ID,
        "  lookup-pad  "
      )
    );
    expect(row.slug).toBe("lookup-pad");
  });
});

describe("listEntitiesForCase", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("accepts a padded case id", async () => {
    const cased = await seedCase(db);
    await runDomain(
      createEntityEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        kind: "person",
        name: "Padded Case",
        slug: "padded-case",
      })
    );
    const rows = await runDomain(
      listEntitiesForCaseEffect(
        `  ${cased.id}  `,
        TEST_ORGANIZATION_ID
      )
    );
    expect(rows.some((row) => row.slug === "padded-case")).toBe(true);
  });
});

describe("deleteEntity", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("removes the entity from the case", async () => {
    const cased = await seedCase(db);
    const entity = await runDomain(
      createEntityEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        kind: "person",
        name: "To Delete",
        slug: "to-delete",
      })
    );
    await runDomain(
      deleteEntityEffect(cased.id, TEST_ORGANIZATION_ID, entity.id)
    );
    const remaining = await runDomain(
      listEntitiesForCaseEffect(cased.id, TEST_ORGANIZATION_ID)
    );
    expect(remaining.find((row) => row.id === entity.id)).toBeUndefined();
  });
});

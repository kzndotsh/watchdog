import { beforeEach, describe, expect, it } from "vitest";

import {
  createEdgeEffect,
  createEntityEffect,
  createQuestionEffect,
  listQuestionsForEntityEffect,
  reopenQuestionEffect,
  resolveQuestionEffect,
  updateEntityFieldsEffect,
} from "@watchdog/core/graph";
import { runDomain } from "@watchdog/core/infra";
import { db, entitiesRepo } from "@watchdog/db";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import { listAllActivity, resetTestDb, seedCase } from "@watchdog/test-db";

import { runGraphMutation } from "../run-graph-mutation";
import { entitiesTable } from "../tables";

const ORG = TEST_ORGANIZATION_ID;

async function seedOrgAndInfra() {
  const cased = await seedCase(db);
  const base = { caseId: cased.id, organizationId: ORG };
  const org = await runDomain(
    createEntityEffect({ ...base, kind: "org", name: "Acme", slug: "acme" })
  );
  const infra = await runDomain(
    createEntityEffect({
      ...base,
      kind: "infra",
      name: "acme.example",
      slug: "acme-example",
    })
  );
  return { base, org, infra };
}

describe("Entities on the Graph mutation module", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("a duplicate slug is Conflict, whether the in-transaction check or the unique index catches it", async () => {
    const { base } = await seedOrgAndInfra();

    // The check inside the transaction.
    await expect(
      runDomain(
        createEntityEffect({
          ...base,
          kind: "org",
          name: "Other",
          slug: "acme",
        })
      )
    ).rejects.toMatchObject({
      _tag: "ConflictError",
      reason: 'Slug "acme" already exists in this Case',
    });

    // The unique index alone, with no check before the insert.
    await expect(
      runDomain(
        runGraphMutation({ ...base, channel: "dossier" }, (w) =>
          w.insert(entitiesTable, {
            kind: "org",
            name: "Other",
            slug: "acme",
          })
        )
      )
    ).rejects.toMatchObject({
      _tag: "ConflictError",
      reason: 'Slug "acme" already exists in this Case',
    });
  });

  it("of two concurrent creates with one slug exactly one wins", async () => {
    const cased = await seedCase(db);
    const create = (name: string) =>
      runDomain(
        createEntityEffect({
          caseId: cased.id,
          organizationId: ORG,
          kind: "org",
          name,
          slug: "same",
        })
      );

    const settled = await Promise.allSettled([create("A"), create("B")]);

    expect(settled.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const lost = settled.find((r) => r.status === "rejected");
    expect(lost?.reason).toMatchObject({ _tag: "ConflictError" });
    expect(await entitiesRepo.listForCase(db, cased.id)).toHaveLength(1);
  });

  it("a kind change that breaks an incident Edge is refused and writes nothing", async () => {
    const { base, org, infra } = await seedOrgAndInfra();
    await runDomain(
      createEdgeEffect({
        ...base,
        fromId: org.id,
        toId: infra.id,
        predicate: "primary_domain",
        confidence: "unverified",
      })
    );
    const before = (await listAllActivity()).length;

    await expect(
      runDomain(
        updateEntityFieldsEffect({
          ...base,
          entityId: org.id,
          expectedVersion: org.version,
          kind: "infra",
        })
      )
    ).rejects.toMatchObject({ _tag: "InvalidError" });

    expect(await entitiesRepo.getInCase(db, base.caseId, org.id)).toMatchObject(
      { kind: "org", version: org.version }
    );
    expect((await listAllActivity()).length).toBe(before);
  });

  it("seeding the default Questions of a person appends no entries of its own", async () => {
    const cased = await seedCase(db);
    const person = await runDomain(
      createEntityEffect({
        caseId: cased.id,
        organizationId: ORG,
        kind: "person",
        name: "Ada",
        slug: "ada",
      })
    );

    const questions = await runDomain(
      listQuestionsForEntityEffect(cased.id, ORG, person.id)
    );
    expect(questions.items).toHaveLength(5);
    const entries = await listAllActivity();
    expect(entries.map((e) => `${e.kind}.${e.action}`)).toEqual([
      "entity.created",
    ]);
  });
});

describe("Questions on the Graph mutation module", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  async function seedQuestion() {
    const { base, org } = await seedOrgAndInfra();
    const question = await runDomain(
      createQuestionEffect({ ...base, entityId: org.id, text: "Who owns it?" })
    );
    return { base, org, question };
  }

  it("resolving twice is Conflict", async () => {
    const { base, question } = await seedQuestion();
    await runDomain(
      resolveQuestionEffect({ ...base, questionId: question.id })
    );
    const before = (await listAllActivity()).length;

    await expect(
      runDomain(resolveQuestionEffect({ ...base, questionId: question.id }))
    ).rejects.toMatchObject({
      _tag: "ConflictError",
      reason: "Question already resolved",
    });
    expect((await listAllActivity()).length).toBe(before);
  });

  it("reopening an open Question is Conflict", async () => {
    const { base, question } = await seedQuestion();

    await expect(
      runDomain(reopenQuestionEffect({ ...base, questionId: question.id }))
    ).rejects.toMatchObject({
      _tag: "ConflictError",
      reason: "Question is already open",
    });
  });

  it("reopen keeps the `updated` verb with its from and to values", async () => {
    const { base, question } = await seedQuestion();
    await runDomain(
      resolveQuestionEffect({ ...base, questionId: question.id })
    );

    const reopened = await runDomain(
      reopenQuestionEffect({ ...base, questionId: question.id })
    );

    expect(reopened.status).toBe("open");
    const entries = await listAllActivity();
    expect(entries.at(-1)).toMatchObject({
      kind: "question",
      action: "updated",
      fromValue: "resolved",
      toValue: "open",
    });
  });

  it("a Question of a missing Entity is NotFound and writes nothing", async () => {
    const { base } = await seedOrgAndInfra();
    const before = (await listAllActivity()).length;

    await expect(
      runDomain(
        createQuestionEffect({
          ...base,
          entityId: "00000000-0000-4000-8000-00000000dead",
          text: "Orphan?",
        })
      )
    ).rejects.toMatchObject({ _tag: "NotFoundError", entity: "Entity" });
    expect((await listAllActivity()).length).toBe(before);
  });
});

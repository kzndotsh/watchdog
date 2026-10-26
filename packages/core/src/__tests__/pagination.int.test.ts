import { Effect } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { listCasesEffect } from "@watchdog/core/cases";
import type { DomainTag } from "@watchdog/core/errors";
import { listEvidenceEffect } from "@watchdog/core/evidence";
import {
  listClaimsForEntityEffect,
  listEdgesForCaseEffect,
  listEdgesForEntityEffect,
  listEntitiesForCaseEffect,
  listEventsForEntityEffect,
  listIdentifiersEffect,
  listQuestionsForEntityEffect,
} from "@watchdog/core/graph";
import { runDomain } from "@watchdog/core/infra";
import type { Db } from "@watchdog/core/infra";
import { listJobsForCaseEffect } from "@watchdog/core/jobs";
import {
  listGraphWritesForCaseEffect,
  listProposalsForCaseEffect,
} from "@watchdog/core/proposals";
import { listTasksForCaseEffect } from "@watchdog/core/tasks";
import {
  claimsRepo,
  db,
  edgesRepo,
  eventsRepo,
  questionsRepo,
  tasksRepo,
} from "@watchdog/db";
import { evidenceList } from "@watchdog/schemas/evidence";
import { identifierList } from "@watchdog/schemas/graph";
import {
  CURSOR_MAX,
  NAME_MAX,
  PAGE_LIMIT_MAX,
  URL_MAX,
} from "@watchdog/schemas/shared";
import type { CaseId, Page } from "@watchdog/schemas/shared";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import {
  resetTestDb,
  seedCase,
  seedEntity,
  seedEvidence,
  seedGraphWrite,
  seedIdentifier,
  seedJob,
  seedProposal,
  withSystemHistoryContext,
} from "@watchdog/test-db";
import { testId } from "@watchdog/test-kit";

type Ctx = { caseId: CaseId; entityId: string };
type Req = { cursor?: string | undefined; limit?: number | undefined };
type Item = { id: string };

type Domain = {
  name: string;
  /** False when the list must not hold the shared hub Entity (the Entity list itself). */
  hub?: boolean;
  /** Creates row number `index` (0-based) and returns its id. */
  seed: (ctx: Ctx, index: number) => Promise<string>;
  list: (ctx: Ctx, page: Req) => Effect.Effect<Page<Item>, DomainTag, Db>;
};

/** Every row of a list, fetched `limit` at a time. */
async function drain(
  domain: Domain,
  ctx: Ctx,
  limit: number
): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each page names the cursor of the next
    const page = await runDomain(domain.list(ctx, { cursor, limit }));
    ids.push(...page.items.map((item) => item.id));
    cursor = page.nextCursor ?? undefined;
  } while (cursor !== undefined);
  return ids;
}

const spoke = (index: number) => testId(300 + index);

const DOMAINS: Domain[] = [
  {
    name: "entities (equal names tie-break on id)",
    hub: false,
    seed: async (ctx, i) =>
      (
        await seedEntity(db, ctx.caseId, {
          id: testId(100 + i),
          name: `Entity ${i % 2}`,
          slug: `entity-${i}`,
        })
      ).id,
    list: (ctx, page) =>
      listEntitiesForCaseEffect(ctx.caseId, TEST_ORGANIZATION_ID, page),
  },
  {
    name: "claims",
    seed: async (ctx, i) => {
      const row = await withSystemHistoryContext(db, async (tx) =>
        claimsRepo.create(tx, {
          entityId: ctx.entityId,
          caseId: ctx.caseId,
          text: `claim ${i}`,
          class: "observation",
          confidence: "unverified",
        })
      );
      if (!row) throw new Error("claim");
      return row.id;
    },
    list: (ctx, page) =>
      listClaimsForEntityEffect(
        ctx.caseId,
        TEST_ORGANIZATION_ID,
        ctx.entityId,
        page
      ),
  },
  {
    name: "events (equal dates tie-break on id)",
    seed: async (ctx, i) => {
      const row = await withSystemHistoryContext(db, async (tx) =>
        eventsRepo.create(tx, {
          entityId: ctx.entityId,
          caseId: ctx.caseId,
          when: `2026-0${(i % 2) + 1}`,
          what: `event ${i}`,
          whereText: null,
        })
      );
      if (!row) throw new Error("event");
      return row.id;
    },
    list: (ctx, page) =>
      listEventsForEntityEffect(
        ctx.caseId,
        TEST_ORGANIZATION_ID,
        ctx.entityId,
        page
      ),
  },
  {
    name: "questions",
    seed: async (ctx, i) => {
      const row = await withSystemHistoryContext(db, async (tx) =>
        questionsRepo.create(tx, {
          entityId: ctx.entityId,
          caseId: ctx.caseId,
          text: `question ${i}`,
          status: "open",
        })
      );
      if (!row) throw new Error("question");
      return row.id;
    },
    list: (ctx, page) =>
      listQuestionsForEntityEffect(
        ctx.caseId,
        TEST_ORGANIZATION_ID,
        ctx.entityId,
        page
      ),
  },
  {
    name: "identifiers of an entity",
    seed: async (ctx, i) =>
      (
        await seedIdentifier(db, ctx.entityId, {
          type: "domain",
          value: `host-${i}.example.com`,
        })
      ).id,
    list: (ctx, page) =>
      listIdentifiersEffect(
        ctx.caseId,
        TEST_ORGANIZATION_ID,
        identifierList.input.parse({
          caseId: ctx.caseId,
          entityId: ctx.entityId,
          ...page,
        })
      ),
  },
  {
    name: "identifiers of a case",
    seed: async (ctx, i) =>
      (
        await seedIdentifier(db, ctx.entityId, {
          type: "domain",
          value: `case-host-${i}.example.com`,
        })
      ).id,
    list: (ctx, page) =>
      listIdentifiersEffect(
        ctx.caseId,
        TEST_ORGANIZATION_ID,
        identifierList.input.parse({ caseId: ctx.caseId, ...page })
      ),
  },
  {
    name: "connections of an entity (one predicate, ties on id)",
    seed: async (ctx, i) => {
      await seedEntity(db, ctx.caseId, {
        id: spoke(i),
        name: `Spoke ${i}`,
        slug: `spoke-${i}`,
      });
      const row = await withSystemHistoryContext(db, async (tx) =>
        edgesRepo.create(tx, {
          fromId: ctx.entityId,
          toId: spoke(i),
          caseId: ctx.caseId,
          predicate: "associate_of",
          confidence: "unverified",
          notes: null,
        })
      );
      if (!row) throw new Error("edge");
      return row.id;
    },
    list: (ctx, page) =>
      listEdgesForEntityEffect(
        ctx.caseId,
        TEST_ORGANIZATION_ID,
        ctx.entityId,
        page
      ),
  },
  {
    name: "connections of a case",
    seed: async (ctx, i) => {
      await seedEntity(db, ctx.caseId, {
        id: spoke(i),
        name: `Spoke ${i}`,
        slug: `spoke-${i}`,
      });
      const row = await withSystemHistoryContext(db, async (tx) =>
        edgesRepo.create(tx, {
          fromId: ctx.entityId,
          toId: spoke(i),
          caseId: ctx.caseId,
          predicate: "associate_of",
          confidence: "unverified",
          notes: null,
        })
      );
      if (!row) throw new Error("edge");
      return row.id;
    },
    list: (ctx, page) =>
      listEdgesForCaseEffect(ctx.caseId, TEST_ORGANIZATION_ID, page),
  },
  {
    name: "evidence (newest first)",
    seed: async (ctx) => (await seedEvidence(db, ctx.caseId)).id,
    list: (ctx, page) =>
      listEvidenceEffect(
        ctx.caseId,
        TEST_ORGANIZATION_ID,
        evidenceList.input.parse({ caseId: ctx.caseId, ...page })
      ),
  },
  {
    name: "jobs (most recently updated first)",
    seed: async (ctx) => (await seedJob(db, ctx.caseId)).id,
    list: (ctx, page) =>
      listJobsForCaseEffect(ctx.caseId, TEST_ORGANIZATION_ID, page),
  },
  {
    name: "proposals (newest first)",
    seed: async (ctx) => (await seedProposal(db, ctx.caseId, [])).id,
    list: (ctx, page) =>
      listProposalsForCaseEffect(ctx.caseId, TEST_ORGANIZATION_ID, page),
  },
  {
    name: "graph writes (newest first)",
    seed: async (ctx) => (await seedGraphWrite(db, ctx.caseId, [])).id,
    list: (ctx, page) =>
      listGraphWritesForCaseEffect(ctx.caseId, TEST_ORGANIZATION_ID, page),
  },
  {
    name: "tasks (one position, ties on creation time then id)",
    seed: async (ctx) => {
      const row = await withSystemHistoryContext(db, async (tx) =>
        tasksRepo.create(tx, {
          caseId: ctx.caseId,
          title: "Follow up",
          status: "backlog",
          position: 0,
        })
      );
      if (!row) throw new Error("task");
      return row.id;
    },
    list: (ctx, page) =>
      listTasksForCaseEffect(ctx.caseId, TEST_ORGANIZATION_ID, page),
  },
];

/** The `_tag` of the failure of an effect that must fail ("succeeded" when it does not). */
function failureTag(effect: Effect.Effect<unknown, DomainTag, Db>) {
  return effect.pipe(
    Effect.match({
      onFailure: (error) => error._tag,
      onSuccess: () => "succeeded",
    })
  );
}

const ROWS = 7;

describe.each(DOMAINS)("paged list: $name", (domain) => {
  let ctx: Ctx;

  beforeEach(async () => {
    await resetTestDb();
    const cased = await seedCase(db);
    const hub =
      domain.hub === false
        ? undefined
        : await seedEntity(db, cased.id, {
            id: testId(50),
            name: "Hub",
            slug: "hub",
          });
    ctx = { caseId: cased.id, entityId: hub?.id ?? "" };
  });

  async function seedRows(count: number, from = 0): Promise<string[]> {
    const ids: string[] = [];
    for (let i = from; i < from + count; i += 1) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- insertion order is part of the test
      ids.push(await domain.seed(ctx, i));
    }
    return ids;
  }

  it("returns every row exactly once, in the same order whatever the page size", async () => {
    const seeded = await seedRows(ROWS);
    const whole = await drain(domain, ctx, PAGE_LIMIT_MAX);
    expect(new Set(whole)).toEqual(new Set(seeded));
    expect(whole).toHaveLength(seeded.length);
    for (const size of [1, 2, 3]) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- one page size at a time
      expect(await drain(domain, ctx, size)).toEqual(whole);
    }
  });

  it("ends with a null cursor on the last page and has no cursor when everything fits", async () => {
    await seedRows(3);
    const all = await runDomain(domain.list(ctx, { limit: 3 }));
    expect(all.items).toHaveLength(3);
    expect(all.nextCursor).toBeNull();
    const first = await runDomain(domain.list(ctx, { limit: 2 }));
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
  });

  it("keeps the cursor stable under inserts: no row twice, none skipped", async () => {
    const seeded = await seedRows(ROWS);
    const first = await runDomain(domain.list(ctx, { limit: 3 }));
    expect(first.nextCursor).not.toBeNull();
    const firstIds = first.items.map((item) => item.id);

    // New rows land while the reader is between pages.
    const inserted = await seedRows(2, ROWS);

    const rest: string[] = [];
    let cursor = first.nextCursor ?? undefined;
    while (cursor !== undefined) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- each page names the cursor of the next
      const page = await runDomain(domain.list(ctx, { cursor, limit: 3 }));
      rest.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor ?? undefined;
    }

    const seen = [...firstIds, ...rest];
    expect(new Set(seen).size).toBe(seen.length);
    for (const id of seeded) expect(seen).toContain(id);
    for (const id of seen) expect([...seeded, ...inserted]).toContain(id);
  });

  it("refuses a cursor that is not one of this list's", async () => {
    await seedRows(3);
    const garbage = await runDomain(
      failureTag(domain.list(ctx, { cursor: "not-a-cursor", limit: 2 }))
    );
    expect(garbage).toBe("InvalidError");
    const foreign = Buffer.from(
      JSON.stringify([testId(1), "a", "b", "c", "d"])
    ).toString("base64url");
    const mismatched = await runDomain(
      failureTag(domain.list(ctx, { cursor: foreign, limit: 2 }))
    );
    expect(mismatched).toBe("InvalidError");
  });
});

describe("page size", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("caps a page at the maximum however large a limit is asked for", async () => {
    const cased = await seedCase(db);
    for (let i = 0; i < PAGE_LIMIT_MAX + 5; i += 1) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- sequential seed keeps ids and names distinct
      await seedEntity(db, cased.id, {
        id: testId(1000 + i),
        name: `Entity ${String(i).padStart(4, "0")}`,
        slug: `entity-${i}`,
      });
    }
    const page = await runDomain(
      listEntitiesForCaseEffect(cased.id, TEST_ORGANIZATION_ID, {
        limit: 10_000,
      })
    );
    expect(page.items).toHaveLength(PAGE_LIMIT_MAX);
    expect(page.nextCursor).not.toBeNull();
    const rest = await runDomain(
      listEntitiesForCaseEffect(cased.id, TEST_ORGANIZATION_ID, {
        cursor: page.nextCursor ?? undefined,
        limit: 10_000,
      })
    );
    expect(rest.items).toHaveLength(5);
    expect(rest.nextCursor).toBeNull();
  });

  it("answers an empty list with an empty page and no cursor", async () => {
    const cased = await seedCase(db);
    const page = await runDomain(
      listEntitiesForCaseEffect(cased.id, TEST_ORGANIZATION_ID)
    );
    expect(page).toEqual({ items: [], nextCursor: null });
  });

  it("pages the Cases of an organization by name", async () => {
    await seedCase(db, { name: "Charlie" });
    await seedCase(db, { name: "Alpha" });
    await seedCase(db, { name: "Bravo" });
    const first = await runDomain(
      listCasesEffect(TEST_ORGANIZATION_ID, { limit: 2 })
    );
    expect(first.items.map((row) => row.name)).toEqual(["Alpha", "Bravo"]);
    const second = await runDomain(
      listCasesEffect(TEST_ORGANIZATION_ID, {
        cursor: first.nextCursor ?? undefined,
        limit: 2,
      })
    );
    expect(second.items.map((row) => row.name)).toEqual(["Charlie"]);
    expect(second.nextCursor).toBeNull();
  });

  it("pages through a row with the largest sort key an Identifier list has", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, {
      id: testId(60),
      name: "E".repeat(NAME_MAX),
      slug: "big-name",
    });
    for (const [index, ch] of ["a", "b", "c"].entries()) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- sequential seed
      await seedIdentifier(db, entity.id, {
        id: testId(70 + index),
        type: "other",
        value: ch.repeat(URL_MAX),
      });
    }
    const first = await runDomain(
      listIdentifiersEffect(
        cased.id,
        TEST_ORGANIZATION_ID,
        identifierList.input.parse({ caseId: cased.id, limit: 1 })
      )
    );
    expect(first.nextCursor).not.toBeNull();
    expect((first.nextCursor ?? "").length).toBeLessThanOrEqual(CURSOR_MAX);
    const seen = [...first.items];
    let cursor = first.nextCursor ?? undefined;
    while (cursor !== undefined) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- each page names the cursor of the next
      const page = await runDomain(
        listIdentifiersEffect(
          cased.id,
          TEST_ORGANIZATION_ID,
          identifierList.input.parse({ caseId: cased.id, cursor, limit: 1 })
        )
      );
      seen.push(...page.items);
      cursor = page.nextCursor ?? undefined;
    }
    expect(seen.map((row) => row.value.slice(0, 1))).toEqual(["a", "b", "c"]);
  });

  describe("a cursor is checked against its list", () => {
    const cursorOf = (parts: unknown[]) =>
      Buffer.from(JSON.stringify(parts)).toString("base64url");

    it.each([
      ["another list's", cursorOf(["claims", testId(1), "x"])],
      ["a malformed id", cursorOf(["entities", "not-a-uuid", "x"])],
      ["a key of the wrong type", cursorOf(["entities", testId(1), 5])],
      ["too few parts", cursorOf(["entities", testId(1)])],
      ["not base64 JSON", "%%%"],
      [
        "an oversized key",
        cursorOf(["entities", testId(1), "x".repeat(URL_MAX + 1)]),
      ],
    ])(
      "refuses %s cursor as invalid input, never a server error",
      async (_name, cursor) => {
        const cased = await seedCase(db);
        const tag = await runDomain(
          failureTag(
            listEntitiesForCaseEffect(cased.id, TEST_ORGANIZATION_ID, {
              cursor,
            })
          )
        );
        expect(tag).toBe("InvalidError");
      }
    );
  });
});

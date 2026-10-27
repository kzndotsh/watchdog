import { ORPCError } from "@orpc/server";
import { beforeEach, describe, expect, it } from "vitest";

import { PAGE_LIMIT_DEFAULT, PAGE_LIMIT_MAX } from "@watchdog/schemas/shared";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import { resetTestDb, seedCase, seedEntity, testDb } from "@watchdog/test-db";
import { TEST_ACTOR_ID, testId } from "@watchdog/test-kit";

import { clientFor } from "./org-isolation-fixtures";

const client = clientFor(TEST_ORGANIZATION_ID, TEST_ACTOR_ID);

async function codeOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
    return "no error";
  } catch (error) {
    if (error instanceof ORPCError) {
      const data: unknown = error.data;
      const code =
        typeof data === "object" && data !== null
          ? Reflect.get(data, "code")
          : undefined;
      return `${error.code}/${String(code)}`;
    }
    return String(error);
  }
}

describe("a paged list over the API", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("returns { items, nextCursor } and follows nextCursor to the last page", async () => {
    const cased = await seedCase(testDb);
    for (let i = 0; i < 5; i += 1) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- sequential, so names sort as seeded
      await seedEntity(testDb, cased.id, {
        id: testId(100 + i),
        name: `Entity ${i}`,
        slug: `entity-${i}`,
      });
    }
    const first = await client.entities.list({ caseId: cased.id, limit: 2 });
    expect(first.items.map((row) => row.name)).toEqual([
      "Entity 0",
      "Entity 1",
    ]);
    expect(first.nextCursor).toEqual(expect.any(String));

    const second = await client.entities.list({
      caseId: cased.id,
      limit: 2,
      cursor: first.nextCursor ?? undefined,
    });
    expect(second.items.map((row) => row.name)).toEqual([
      "Entity 2",
      "Entity 3",
    ]);

    const last = await client.entities.list({
      caseId: cased.id,
      limit: 2,
      cursor: second.nextCursor ?? undefined,
    });
    expect(last.items.map((row) => row.name)).toEqual(["Entity 4"]);
    expect(last.nextCursor).toBeNull();
  });

  it("uses the default page size when none is sent", async () => {
    const cased = await seedCase(testDb);
    await seedEntity(testDb, cased.id, { id: testId(100), name: "Only" });
    const page = await client.entities.list({ caseId: cased.id });
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBeNull();
    expect(PAGE_LIMIT_DEFAULT).toBeLessThanOrEqual(PAGE_LIMIT_MAX);
  });

  it("refuses a page size above the maximum, or below one, as invalid input", async () => {
    const cased = await seedCase(testDb);
    expect(
      await codeOf(async () =>
        client.entities.list({ caseId: cased.id, limit: PAGE_LIMIT_MAX + 1 })
      )
    ).toBe("BAD_REQUEST/invalid");
    expect(
      await codeOf(async () =>
        client.entities.list({ caseId: cased.id, limit: 0 })
      )
    ).toBe("BAD_REQUEST/invalid");
    expect(
      await codeOf(async () =>
        client.entities.list({ caseId: cased.id, limit: PAGE_LIMIT_MAX })
      )
    ).toBe("no error");
  });

  it("refuses a cursor it did not issue as invalid input", async () => {
    const cased = await seedCase(testDb);
    expect(
      await codeOf(async () =>
        client.entities.list({ caseId: cased.id, cursor: "nope" })
      )
    ).toBe("BAD_REQUEST/invalid");
  });

  it("pages the Case list without an input", async () => {
    await seedCase(testDb, { name: "Alpha" });
    await seedCase(testDb, { name: "Bravo" });
    const page = await client.cases.list({});
    expect(page.items.map((row) => row.name)).toEqual(["Alpha", "Bravo"]);
    expect(page.nextCursor).toBeNull();
    const small = await client.cases.list({ limit: 1 });
    expect(small.items).toHaveLength(1);
    expect(small.nextCursor).not.toBeNull();
  });
});

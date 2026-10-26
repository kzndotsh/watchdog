import { beforeEach, describe, expect, it } from "vitest";

import { isDomainTag } from "@watchdog/core/errors";
import { getGraphEgoEffect } from "@watchdog/core/graph";
import { runDomain } from "@watchdog/core/infra";
import { edgesRepo } from "@watchdog/db";
import {
  TEST_ORGANIZATION_ID,
  TEST_OTHER_ORGANIZATION_ID,
} from "@watchdog/schemas/testing";
import {
  resetTestDb,
  seedCase,
  seedEntity,
  testDb,
  withSystemHistoryContext,
} from "@watchdog/test-db";
import { testId } from "@watchdog/test-kit";

type SeededCase = Awaited<ReturnType<typeof seedCase>>;

async function connect(cased: SeededCase, fromId: string, toId: string) {
  const row = await withSystemHistoryContext(testDb, async (tx) =>
    edgesRepo.create(tx, {
      fromId,
      toId,
      caseId: cased.id,
      predicate: "associate_of",
      confidence: "unverified",
      notes: null,
    })
  );
  if (!row) throw new Error("edge");
  return row;
}

/** hub → a, b → hub, hub → c (created in that order), a → b; d has no Connection. */
async function seedStar() {
  const cased = await seedCase(testDb, {
    name: "Ego",
    slug: "ego",
    organizationId: TEST_ORGANIZATION_ID,
  });
  const entity = async (n: number, slug: string) =>
    seedEntity(testDb, cased.id, { id: testId(n), name: slug, slug });
  const hub = await entity(31, "hub");
  const a = await entity(32, "a");
  const b = await entity(33, "b");
  const c = await entity(34, "c");
  const d = await entity(35, "d");
  const toA = await connect(cased, hub.id, a.id);
  const fromB = await connect(cased, b.id, hub.id);
  const toC = await connect(cased, hub.id, c.id);
  await connect(cased, a.id, b.id);
  return { cased, hub, a, b, c, d, toA, fromB, toC };
}

describe("graph ego", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("returns every Connection at either end with its peer, newest first, when it fits", async () => {
    const { cased, hub, a, b, c, toA, fromB, toC } = await seedStar();

    const ego = await runDomain(
      getGraphEgoEffect(cased.id, TEST_ORGANIZATION_ID, hub.id)
    );

    expect(ego.isTruncated).toBe(false);
    expect(ego.edges.map((edge) => edge.id)).toEqual([
      toC.id,
      fromB.id,
      toA.id,
    ]);
    expect(ego.edges.map((edge) => edge.peer.id)).toEqual([c.id, b.id, a.id]);
    expect(ego.edges[1]).toMatchObject({
      fromId: b.id,
      toId: hub.id,
      peer: { id: b.id, name: "b", slug: "b", kind: "person" },
    });
  });

  it("keeps the most recently updated Connections up to the cap and says it was cut", async () => {
    const { cased, hub, toC, fromB } = await seedStar();

    const cut = await runDomain(
      getGraphEgoEffect(cased.id, TEST_ORGANIZATION_ID, hub.id, 2)
    );
    expect(cut.isTruncated).toBe(true);
    expect(cut.edges.map((edge) => edge.id)).toEqual([toC.id, fromB.id]);

    const exact = await runDomain(
      getGraphEgoEffect(cased.id, TEST_ORGANIZATION_ID, hub.id, 3)
    );
    expect(exact.isTruncated).toBe(false);
    expect(exact.edges).toHaveLength(3);
  });

  it("answers an Entity without Connections with nothing", async () => {
    const { cased, d } = await seedStar();
    const ego = await runDomain(
      getGraphEgoEffect(cased.id, TEST_ORGANIZATION_ID, d.id)
    );
    expect(ego).toEqual({ edges: [], isTruncated: false });
  });

  it("refuses an Entity of another Case, and another organization's Case", async () => {
    const { cased, hub } = await seedStar();
    const other = await seedCase(testDb, {
      name: "Other",
      slug: "other-ego",
      organizationId: TEST_ORGANIZATION_ID,
    });
    const isNotFound = (error: unknown) =>
      isDomainTag(error) && error.code === "not_found";
    await expect(
      runDomain(getGraphEgoEffect(other.id, TEST_ORGANIZATION_ID, hub.id))
    ).rejects.toSatisfy(isNotFound);
    await expect(
      runDomain(getGraphEgoEffect(cased.id, TEST_OTHER_ORGANIZATION_ID, hub.id))
    ).rejects.toSatisfy(isNotFound);
  });
});

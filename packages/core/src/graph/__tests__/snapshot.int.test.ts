import { beforeEach, describe, expect, it } from "vitest";

import { isDomainTag } from "@watchdog/core/errors";
import { getGraphSnapshotEffect } from "@watchdog/core/graph";
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

/**
 * hub: 3 Connections (a, b, c) · a, b: 2 each (hub and each other) · c: 1 · d, e: none.
 */
async function seedGraph() {
  const cased = await seedCase(testDb, {
    name: "Graphed",
    slug: "graphed",
    organizationId: TEST_ORGANIZATION_ID,
  });
  const entity = async (n: number, slug: string) =>
    seedEntity(testDb, cased.id, { id: testId(n), name: slug, slug });
  const hub = await entity(11, "hub");
  const a = await entity(12, "a");
  const b = await entity(13, "b");
  const c = await entity(14, "c");
  await entity(15, "d");
  await entity(16, "e");
  await connect(cased, hub.id, a.id);
  await connect(cased, b.id, hub.id);
  await connect(cased, hub.id, c.id);
  await connect(cased, a.id, b.id);
  return { cased, hub, a, b, c };
}

describe("graph snapshot", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("returns the whole graph, slim, when it fits", async () => {
    const { cased } = await seedGraph();

    const snapshot = await runDomain(
      getGraphSnapshotEffect(cased.id, TEST_ORGANIZATION_ID)
    );

    expect(snapshot.isTruncated).toBe(false);
    expect(snapshot.entities).toHaveLength(6);
    expect(snapshot.edges).toHaveLength(4);
    expect(Object.keys(snapshot.entities[0] ?? {}).sort()).toEqual([
      "id",
      "kind",
      "name",
      "slug",
    ]);
    expect(Object.keys(snapshot.edges[0] ?? {}).sort()).toEqual([
      "confidence",
      "fromId",
      "id",
      "predicate",
      "toId",
    ]);
  });

  it("keeps the most connected Entities and only the Connections between them", async () => {
    const { cased, hub, a, b, c } = await seedGraph();

    const three = await runDomain(
      getGraphSnapshotEffect(cased.id, TEST_ORGANIZATION_ID, {
        entityMax: 3,
        edgeMax: 10,
      })
    );
    expect(three.isTruncated).toBe(true);
    expect(three.entities[0]?.id).toBe(hub.id);
    expect(three.entities.map((entity) => entity.id).sort()).toEqual(
      [hub.id, a.id, b.id].sort()
    );
    // hub to c is left out: c is not drawn.
    const kept = new Set([hub.id, a.id, b.id]);
    expect(three.edges).toHaveLength(3);
    for (const edge of three.edges) {
      expect(kept.has(edge.fromId) && kept.has(edge.toId)).toBe(true);
    }

    const four = await runDomain(
      getGraphSnapshotEffect(cased.id, TEST_ORGANIZATION_ID, {
        entityMax: 4,
        edgeMax: 10,
      })
    );
    // c (one Connection) comes before d and e (none).
    expect(four.entities.map((entity) => entity.id)).toContain(c.id);
  });

  it("cuts the Connections at their cap and says so", async () => {
    const { cased } = await seedGraph();

    const atCap = await runDomain(
      getGraphSnapshotEffect(cased.id, TEST_ORGANIZATION_ID, {
        entityMax: 6,
        edgeMax: 4,
      })
    );
    expect(atCap.isTruncated).toBe(false);
    expect(atCap.edges).toHaveLength(4);

    const cut = await runDomain(
      getGraphSnapshotEffect(cased.id, TEST_ORGANIZATION_ID, {
        entityMax: 6,
        edgeMax: 3,
      })
    );
    expect(cut.isTruncated).toBe(true);
    expect(cut.entities).toHaveLength(6);
    expect(cut.edges).toHaveLength(3);
  });

  it("answers an empty Case with nothing, not truncated", async () => {
    const cased = await seedCase(testDb, {
      name: "Empty",
      slug: "empty-graph",
      organizationId: TEST_ORGANIZATION_ID,
    });
    const snapshot = await runDomain(
      getGraphSnapshotEffect(cased.id, TEST_ORGANIZATION_ID)
    );
    expect(snapshot).toEqual({ entities: [], edges: [], isTruncated: false });
  });

  it("does not reveal another organization's Case", async () => {
    const { cased } = await seedGraph();
    await expect(
      runDomain(getGraphSnapshotEffect(cased.id, TEST_OTHER_ORGANIZATION_ID))
    ).rejects.toSatisfy(
      (error: unknown) => isDomainTag(error) && error.code === "not_found"
    );
  });
});

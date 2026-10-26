import { describe, expect, it } from "vitest";

import { entityList } from "@watchdog/schemas/graph";
import { seedCase, seedEntity, withSystemTestTx } from "@watchdog/test-db";
import { testId } from "@watchdog/test-kit";

import { edgesRepo } from "../edges.repo.ts";
import { entityListRepo } from "../entity-list.repo.ts";

describe("entityListRepo connections", () => {
  it("joins each row's Connection counts and one Connection with its peer", async () => {
    await withSystemTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const hub = await seedEntity(tx, cased.id, {
        id: testId(901),
        name: "alpha hub",
        slug: "alpha-hub",
      });
      const leaf = await seedEntity(tx, cased.id, {
        id: testId(902),
        name: "bravo leaf",
        slug: "bravo-leaf",
        kind: "org",
      });
      const other = await seedEntity(tx, cased.id, {
        id: testId(903),
        name: "charlie other",
        slug: "charlie-other",
      });
      await seedEntity(tx, cased.id, {
        id: testId(904),
        name: "delta lone",
        slug: "delta-lone",
      });
      const toLeaf = await edgesRepo.create(tx, {
        fromId: hub.id,
        toId: leaf.id,
        caseId: cased.id,
        predicate: "owns",
        confidence: "unverified",
        notes: "since 2020",
      });
      await edgesRepo.create(tx, {
        fromId: other.id,
        toId: hub.id,
        caseId: cased.id,
        predicate: "related_to",
        confidence: "unverified",
        notes: "met once",
      });
      if (!toLeaf) throw new Error("edge");

      const rows = await entityListRepo.page(
        tx,
        { caseId: cased.id },
        entityList.queryOf({}),
        { limit: 10, after: undefined }
      );
      const byName = new Map(rows.map((row) => [row.name, row]));

      expect(byName.get("alpha hub")?.connections).toEqual({
        outgoing: 1,
        incoming: 1,
      });
      expect(byName.get("delta lone")?.connections).toEqual({
        outgoing: 0,
        incoming: 0,
      });
      expect(byName.get("delta lone")?.soleConnection.edgeId).toBeNull();
      expect(byName.get("bravo leaf")?.connections).toEqual({
        outgoing: 0,
        incoming: 1,
      });
      expect(byName.get("bravo leaf")?.soleConnection).toMatchObject({
        edgeId: toLeaf.id,
        fromId: hub.id,
        toId: leaf.id,
        predicate: "owns",
        notes: "since 2020",
        version: toLeaf.version,
        peerId: hub.id,
        peerName: "alpha hub",
        peerSlug: "alpha-hub",
      });
      expect(byName.get("charlie other")?.soleConnection).toMatchObject({
        peerId: hub.id,
        peerName: "alpha hub",
      });
    });
  });
});

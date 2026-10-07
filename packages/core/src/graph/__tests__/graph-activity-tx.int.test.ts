import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runDomain } from "@watchdog/core/infra";
import {
  activityLogRepo,
  casesRepo,
  claimsRepo,
  db,
  edgesRepo,
  entitiesRepo,
  eventsRepo,
  identifiersRepo,
  questionsRepo,
} from "@watchdog/db";
import { resetTestDb } from "@watchdog/test-db";

import {
  GRAPH_MUTATIONS,
  seedGraphFixture,
  type GraphFixture,
} from "./graph-mutations";

const APPEND_FAILURE = "append failed";
const START = { xid: "0", id: 0 } as const;

/** Every Graph row of the fixture Case, so a rolled-back write must leave all of it as it was. */
async function graphSnapshot(fx: GraphFixture) {
  const entities = await entitiesRepo.listForCase(db, fx.caseId);
  return JSON.stringify({
    case: await casesRepo.getById(db, fx.caseId, fx.organizationId),
    entities,
    edges: await edgesRepo.listForCase(db, fx.caseId),
    perEntity: await Promise.all(
      entities.map(async (entity) => ({
        claims: await claimsRepo.listForEntity(db, entity.id),
        identifiers: await identifiersRepo.listForEntity(db, entity.id),
        events: await eventsRepo.listForEntity(db, entity.id),
        questions: await questionsRepo.listForEntity(db, entity.id),
      }))
    ),
  });
}

describe("a Graph write and its activity entry share one transaction", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(
    GRAPH_MUTATIONS.map((mutation) => [mutation.name, mutation] as const)
  )("%s: a failed append rolls the write back", async (_name, mutation) => {
    const fx = await seedGraphFixture();
    const before = await graphSnapshot(fx);
    const entriesBefore = await activityLogRepo.drain(db, {
      after: START,
      limit: 1000,
    });
    const append = vi
      .spyOn(activityLogRepo, "append")
      .mockRejectedValueOnce(new Error(APPEND_FAILURE));
    // the injected failure is what rejects, and the write got as far as its append
    await expect(runDomain(mutation.run(fx))).rejects.toThrow(APPEND_FAILURE);
    expect(append).toHaveBeenCalledTimes(1);
    expect(await graphSnapshot(fx)).toBe(before);
    expect(
      await activityLogRepo.drain(db, { after: START, limit: 1000 })
    ).toHaveLength(entriesBefore.length);
  });
});

import { beforeEach, describe, expect, it } from "vitest";

import { resetTestDb } from "@watchdog/test-db";

import { db } from "../../client.ts";
import { activityCursorsRepo } from "../activity-cursors.repo.ts";

describe("activityCursorsRepo", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("has no cursor for a consumer that never wrote one", async () => {
    expect(await activityCursorsRepo.get(db, "worker-export")).toBeNull();
  });

  it("stores and replaces one cursor per consumer", async () => {
    await activityCursorsRepo.set(db, "worker-export", { xid: "10", id: 4 });
    expect(await activityCursorsRepo.get(db, "worker-export")).toEqual({
      xid: "10",
      id: 4,
    });
    await activityCursorsRepo.set(db, "worker-export", { xid: "12", id: 9 });
    expect(await activityCursorsRepo.get(db, "worker-export")).toEqual({
      xid: "12",
      id: 9,
    });
    expect(await activityCursorsRepo.get(db, "other")).toBeNull();
  });

  it("keeps an xid beyond 2^53 exactly", async () => {
    const xid = "18446744073709551000";
    await activityCursorsRepo.set(db, "worker-export", { xid, id: 1 });
    expect(await activityCursorsRepo.get(db, "worker-export")).toEqual({
      xid,
      id: 1,
    });
  });

  it("can move a cursor backwards (a resync resets it to the head)", async () => {
    await activityCursorsRepo.set(db, "worker-export", { xid: "50", id: 50 });
    await activityCursorsRepo.set(db, "worker-export", { xid: "0", id: 0 });
    expect(await activityCursorsRepo.get(db, "worker-export")).toEqual({
      xid: "0",
      id: 0,
    });
  });
});

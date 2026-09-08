import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

const { getByIds } = vi.hoisted(() => ({
  getByIds: vi.fn().mockResolvedValue([]),
}));

vi.mock("@watchdog/db", () => ({
  db: {},
  usersRepo: { getByIds },
}));

import { labelForActor, loadActorUsersEffect } from "../resolve-actor-labels";

describe("loadActorUsersEffect", () => {
  it("filters blank, api-key, and invalid actor ids before querying users", async () => {
    const userId = testId(1);
    getByIds.mockClear();
    await Effect.runPromise(
      loadActorUsersEffect([
        undefined as unknown as string,
        "",
        userId,
        userId,
        "api-key:cli",
        "user-1",
      ])
    );
    expect(getByIds).toHaveBeenCalledWith({}, [userId]);
  });

  it("skips the users query when no actor ids are valid UUIDs", async () => {
    getByIds.mockClear();
    const users = await Effect.runPromise(
      loadActorUsersEffect(["api-key:cli", "user-1", ""])
    );
    expect(getByIds).not.toHaveBeenCalled();
    expect(users.size).toBe(0);
  });
});

describe("labelForActor", () => {
  it("labels from the users map", () => {
    const users = new Map([
      ["user-1", { name: "Ada", email: "ada@mailhost.test" }],
    ]);
    expect(labelForActor("user-1", users)).toBe("ada");
  });

  it("prefers a stored label when the user is missing", () => {
    expect(labelForActor("missing", new Map(), "api-key:cli")).toBe(
      "api-key:cli"
    );
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", async () =>
  (await import("@/testing/server-fn")).serverFnModuleDouble()
);
vi.mock("@/lib/orpc.server", async () =>
  (await import("@/testing/server-fn")).orpcServerModuleDouble()
);

import {
  createEntityFn,
  deleteEntityFn,
  getEntityBySlugFn,
  listEntitiesPageFn,
  updateEntityFieldsFn,
} from "@/domains/entities/entities.functions";
import { buildEntityRecord } from "@/testing/records";
import { callServerFn, orpc, orpcNotFound } from "@/testing/server-fn";
import { testId } from "@watchdog/test-kit";

const CASE_ID = testId(10);

beforeEach(() => orpc.reset());

describe("getEntityBySlugFn", () => {
  it("looks the Entity up by the slugified form of a padded or display-style slug", async () => {
    orpc.reply("entities.get", buildEntityRecord({ slug: "alpha-beta" }));

    await callServerFn(getEntityBySlugFn, {
      caseId: CASE_ID,
      slug: "  Alpha Beta  ",
    });

    expect(orpc.calls("entities.get")).toEqual([
      { caseId: CASE_ID, slug: "alpha-beta" },
    ]);
  });

  it("refuses a blank slug without asking the API", async () => {
    await expect(
      callServerFn(getEntityBySlugFn, { caseId: CASE_ID, slug: "   " })
    ).rejects.toThrow();

    expect(orpc.calls("entities.get")).toEqual([]);
  });

  it("answers null when the Entity is gone", async () => {
    orpc.fail("entities.get", orpcNotFound());

    await expect(
      callServerFn(getEntityBySlugFn, { caseId: CASE_ID, slug: "alpha" })
    ).resolves.toBeNull();
  });

  it("rethrows any other API failure", async () => {
    orpc.fail("entities.get", new Error("db down"));

    await expect(
      callServerFn(getEntityBySlugFn, { caseId: CASE_ID, slug: "alpha" })
    ).rejects.toThrow("db down");
  });
});

describe("deleteEntityFn", () => {
  it("sends only the Case and Entity ids and answers nothing", async () => {
    orpc.reply("entities.delete", { ok: true });

    await expect(
      callServerFn(deleteEntityFn, { caseId: CASE_ID, entityId: testId(1) })
    ).resolves.toBeUndefined();

    expect(orpc.calls("entities.delete")).toEqual([
      { caseId: CASE_ID, entityId: testId(1) },
    ]);
  });
});

describe("input validation", () => {
  it.each([
    ["listEntitiesPageFn", listEntitiesPageFn, { caseId: "not-a-uuid" }],
    [
      "createEntityFn",
      createEntityFn,
      { caseId: CASE_ID, kind: "spaceship", name: "A" },
    ],
    [
      "updateEntityFieldsFn",
      updateEntityFieldsFn,
      { caseId: CASE_ID, entityId: "x" },
    ],
    ["deleteEntityFn", deleteEntityFn, { caseId: CASE_ID, entityId: "x" }],
  ] as const)(
    "%s refuses a malformed input before the API is called",
    async (_name, fn, input) => {
      await expect(callServerFn(fn, input)).rejects.toThrow();

      expect(orpc.calls("entities.list")).toEqual([]);
      expect(orpc.calls("entities.create")).toEqual([]);
      expect(orpc.calls("entities.update")).toEqual([]);
      expect(orpc.calls("entities.delete")).toEqual([]);
    }
  );
});

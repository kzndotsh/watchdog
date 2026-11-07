import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", async () =>
  (await import("@/testing/server-fn")).serverFnModuleDouble()
);
vi.mock("@/lib/orpc.server", async () =>
  (await import("@/testing/server-fn")).orpcServerModuleDouble()
);

import {
  createIdentifierFn,
  deleteIdentifierFn,
  listIdentifiersPageFn,
  updateIdentifierFn,
} from "@/domains/entities/identifiers/identifiers.functions";
import { callServerFn, orpc } from "@/testing/server-fn";
import { testId } from "@watchdog/test-kit";

const CASE_ID = testId(10);

beforeEach(() => orpc.reset());

describe("deleteIdentifierFn", () => {
  it("sends only the Case and Identifier ids and answers nothing", async () => {
    orpc.reply("identifiers.delete", { ok: true });

    await expect(
      callServerFn(deleteIdentifierFn, {
        caseId: CASE_ID,
        identifierId: testId(1),
      })
    ).resolves.toBeUndefined();

    expect(orpc.calls("identifiers.delete")).toEqual([
      { caseId: CASE_ID, identifierId: testId(1) },
    ]);
  });
});

describe("input validation", () => {
  it.each([
    ["listIdentifiersPageFn", listIdentifiersPageFn, { caseId: "not-a-uuid" }],
    [
      "createIdentifierFn",
      createIdentifierFn,
      {
        caseId: CASE_ID,
        entityId: testId(20),
        type: "carrier-pigeon",
        value: "x",
      },
    ],
    [
      "updateIdentifierFn",
      updateIdentifierFn,
      { caseId: CASE_ID, identifierId: "x" },
    ],
    [
      "deleteIdentifierFn",
      deleteIdentifierFn,
      { caseId: CASE_ID, identifierId: "x" },
    ],
  ] as const)(
    "%s refuses a malformed input before the API is called",
    async (_name, fn, input) => {
      await expect(callServerFn(fn, input)).rejects.toThrow();

      expect(orpc.calls("identifiers.list")).toEqual([]);
      expect(orpc.calls("identifiers.create")).toEqual([]);
      expect(orpc.calls("identifiers.update")).toEqual([]);
      expect(orpc.calls("identifiers.delete")).toEqual([]);
    }
  );

  it("trims padded ids and keeps the search text on the list read", async () => {
    orpc.reply("identifiers.list", {
      items: [],
      nextCursor: null,
      total: null,
    });

    await callServerFn(listIdentifiersPageFn, {
      caseId: `  ${CASE_ID}  `,
      entityId: testId(20),
      q: "acme",
    });

    expect(orpc.calls("identifiers.list")).toMatchObject([
      { caseId: CASE_ID, entityId: testId(20), q: "acme" },
    ]);
  });
});

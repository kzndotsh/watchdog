import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", async () =>
  (await import("@/testing/server-fn")).serverFnModuleDouble()
);
vi.mock("@/lib/orpc.server", async () =>
  (await import("@/testing/server-fn")).orpcServerModuleDouble()
);

// The request cookie jar: the framework seam `active-case.server` writes through.
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("@tanstack/react-start/server", () => ({
  getCookie: (name: string) => jar.get(name),
  setCookie: (name: string, value: string) => void jar.set(name, value),
  deleteCookie: (name: string) => void jar.delete(name),
}));

// `resolveActiveCase` runs core's healing rule on the database through `runApp`.
const runApp = vi.hoisted(() => vi.fn());
vi.mock("@watchdog/api", () => ({ runApp }));

import {
  createCaseFn,
  deleteCaseFn,
  getCaseBySlugFn,
  getCasesContextFn,
  healActiveCaseFn,
  restoreCaseFn,
  setActiveCaseIdFn,
} from "@/domains/cases/cases.functions";
import { ACTIVE_CASE_COOKIE } from "@/domains/cases/lib/active-case";
import { buildCaseRecord } from "@/testing/records";
import { callServerFn, orpc, orpcNotFound } from "@/testing/server-fn";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

const ORG_CONTEXT = { organizationId: testId(900) };
const CASE_A = buildCaseRecord({ id: testCaseId(1), slug: "alpha" });
const CASE_B = buildCaseRecord({ id: testCaseId(2), slug: "beta" });
const CASE_C = testCaseId(3);

const cookie = () => jar.get(ACTIVE_CASE_COOKIE);

beforeEach(() => {
  orpc.reset();
  jar.clear();
  runApp.mockReset();
});

describe("getCasesContextFn", () => {
  it("heals the cookie to the resolved Case when the stored id is stale", async () => {
    jar.set(ACTIVE_CASE_COOKIE, testCaseId(9));
    runApp.mockResolvedValue({ cases: [CASE_A, CASE_B], active: CASE_A });

    const ctx = await callServerFn(getCasesContextFn, undefined, ORG_CONTEXT);

    expect(ctx.active).toEqual(CASE_A);
    expect(cookie()).toBe(CASE_A.id);
  });

  it("leaves the cookie alone when it already names the resolved Case", async () => {
    jar.set(ACTIVE_CASE_COOKIE, CASE_B.id);
    runApp.mockResolvedValue({ cases: [CASE_A, CASE_B], active: CASE_B });

    await callServerFn(getCasesContextFn, undefined, ORG_CONTEXT);

    expect(cookie()).toBe(CASE_B.id);
  });

  it("clears the cookie when the organization has no Cases", async () => {
    jar.set(ACTIVE_CASE_COOKIE, CASE_A.id);
    runApp.mockResolvedValue({ cases: [], active: null });

    await callServerFn(getCasesContextFn, undefined, ORG_CONTEXT);

    expect(cookie()).toBeUndefined();
  });

  it("refuses a session that has no organization", async () => {
    await expect(
      callServerFn(getCasesContextFn, undefined, { organizationId: null })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(runApp).not.toHaveBeenCalled();
  });
});

describe("getCaseBySlugFn", () => {
  it("looks the Case up by its trimmed slug", async () => {
    orpc.reply("cases.getBySlug", CASE_B);

    await expect(
      callServerFn(getCaseBySlugFn, { caseSlug: "  beta  " })
    ).resolves.toEqual(CASE_B);

    expect(orpc.calls("cases.getBySlug")).toEqual([{ caseSlug: "beta" }]);
  });

  it("answers null for a slug the caller's organization cannot see", async () => {
    orpc.fail("cases.getBySlug", orpcNotFound());

    await expect(
      callServerFn(getCaseBySlugFn, { caseSlug: "their-case" })
    ).resolves.toBeNull();
  });

  it("rethrows any other API failure", async () => {
    orpc.fail("cases.getBySlug", new Error("db down"));

    await expect(
      callServerFn(getCaseBySlugFn, { caseSlug: "beta" })
    ).rejects.toThrow("db down");
  });
});

describe("setActiveCaseIdFn", () => {
  it("writes the cookie once the Case is visible to the caller", async () => {
    orpc.reply("cases.get", CASE_A);

    await expect(
      callServerFn(setActiveCaseIdFn, { caseId: CASE_A.id }, ORG_CONTEXT)
    ).resolves.toBe(CASE_A.id);

    expect(cookie()).toBe(CASE_A.id);
  });

  it("refuses a Case the caller cannot see and writes no cookie", async () => {
    orpc.fail("cases.get", orpcNotFound());

    await expect(
      callServerFn(setActiveCaseIdFn, { caseId: CASE_A.id }, ORG_CONTEXT)
    ).rejects.toThrow("Case not found");

    expect(cookie()).toBeUndefined();
  });

  it("clears the cookie for an empty id without asking the API", async () => {
    jar.set(ACTIVE_CASE_COOKIE, CASE_A.id);

    await expect(
      callServerFn(setActiveCaseIdFn, { caseId: "" }, ORG_CONTEXT)
    ).resolves.toBeNull();

    expect(cookie()).toBeUndefined();
    expect(orpc.calls("cases.get")).toEqual([]);
  });
});

describe("healActiveCaseFn", () => {
  it("moves the cookie to the route's Case while it still holds the expected value", async () => {
    jar.set(ACTIVE_CASE_COOKIE, CASE_B.id);
    orpc.reply("cases.get", CASE_A);

    await expect(
      callServerFn(
        healActiveCaseFn,
        { caseId: CASE_A.id, expectedActiveCaseId: CASE_B.id },
        ORG_CONTEXT
      )
    ).resolves.toEqual({ changed: true });

    expect(cookie()).toBe(CASE_A.id);
  });

  it("sets an unset cookie when the client observed none", async () => {
    orpc.reply("cases.get", CASE_A);

    await expect(
      callServerFn(
        healActiveCaseFn,
        { caseId: CASE_A.id, expectedActiveCaseId: null },
        ORG_CONTEXT
      )
    ).resolves.toEqual({ changed: true });

    expect(cookie()).toBe(CASE_A.id);
  });

  it("does not overwrite a cookie a newer switch changed after the loader read it", async () => {
    jar.set(ACTIVE_CASE_COOKIE, CASE_C);
    orpc.reply("cases.get", CASE_A);

    await expect(
      callServerFn(
        healActiveCaseFn,
        { caseId: CASE_A.id, expectedActiveCaseId: CASE_B.id },
        ORG_CONTEXT
      )
    ).resolves.toEqual({ changed: false });

    expect(cookie()).toBe(CASE_C);
  });

  it("changes nothing when the route's Case is already Active", async () => {
    jar.set(ACTIVE_CASE_COOKIE, CASE_A.id);

    await expect(
      callServerFn(
        healActiveCaseFn,
        { caseId: CASE_A.id, expectedActiveCaseId: CASE_A.id },
        ORG_CONTEXT
      )
    ).resolves.toEqual({ changed: false });

    expect(orpc.calls("cases.get")).toEqual([]);
  });

  it("refuses a Case outside the caller's organization and keeps the cookie", async () => {
    jar.set(ACTIVE_CASE_COOKIE, CASE_B.id);
    orpc.fail("cases.get", orpcNotFound());

    await expect(
      callServerFn(
        healActiveCaseFn,
        { caseId: CASE_A.id, expectedActiveCaseId: CASE_B.id },
        ORG_CONTEXT
      )
    ).rejects.toThrow("Case not found");

    expect(cookie()).toBe(CASE_B.id);
  });
});

describe("createCaseFn", () => {
  it("makes the new Case Active", async () => {
    orpc.reply("cases.create", CASE_A);

    await expect(
      callServerFn(createCaseFn, { name: "Alpha" }, ORG_CONTEXT)
    ).resolves.toEqual(CASE_A);

    expect(orpc.calls("cases.create")).toMatchObject([{ name: "Alpha" }]);
    expect(cookie()).toBe(CASE_A.id);
  });
});

describe("deleteCaseFn", () => {
  it("moves the cookie to the Case the organization falls back to when the Active Case is deleted", async () => {
    jar.set(ACTIVE_CASE_COOKIE, CASE_A.id);
    orpc.reply("cases.delete", { ok: true });
    runApp.mockResolvedValue({ cases: [CASE_B], active: CASE_B });

    await callServerFn(deleteCaseFn, { caseId: CASE_A.id }, ORG_CONTEXT);

    expect(orpc.calls("cases.delete")).toEqual([{ caseId: CASE_A.id }]);
    expect(cookie()).toBe(CASE_B.id);
  });

  it("clears the cookie when no Case is left", async () => {
    jar.set(ACTIVE_CASE_COOKIE, CASE_A.id);
    orpc.reply("cases.delete", { ok: true });
    runApp.mockResolvedValue({ cases: [], active: null });

    await callServerFn(deleteCaseFn, { caseId: CASE_A.id }, ORG_CONTEXT);

    expect(cookie()).toBeUndefined();
  });

  it("keeps the cookie when another Case is deleted", async () => {
    jar.set(ACTIVE_CASE_COOKIE, CASE_B.id);
    orpc.reply("cases.delete", { ok: true });

    await callServerFn(deleteCaseFn, { caseId: CASE_A.id }, ORG_CONTEXT);

    expect(cookie()).toBe(CASE_B.id);
    expect(runApp).not.toHaveBeenCalled();
  });
});

describe("input validation", () => {
  it("refuses a Case id that is not a uuid before the API is called", async () => {
    await expect(
      callServerFn(restoreCaseFn, { caseId: "nope" })
    ).rejects.toThrow();

    expect(orpc.calls("cases.restore")).toEqual([]);
  });

  it("refuses a blank Case slug before the API is called", async () => {
    await expect(
      callServerFn(getCaseBySlugFn, { caseSlug: "   " })
    ).rejects.toThrow();

    expect(orpc.calls("cases.getBySlug")).toEqual([]);
  });
});

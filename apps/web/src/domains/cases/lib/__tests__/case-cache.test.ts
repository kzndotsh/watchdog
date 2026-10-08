import type { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { testCaseId } from "@watchdog/schemas/testing";

vi.mock("@/auth/server", () => ({
  auth: {},
}));

import { writeCaseRecordCache } from "@/domains/cases/lib/case-cache";
import {
  caseByIdQuery,
  caseBySlugQuery,
  casesKeys,
} from "@/domains/cases/queries";
import type { CaseRecord, CasesContext } from "@/domains/cases/types";

const CASE: CaseRecord = {
  id: testCaseId(1),
  slug: "alpha",
  name: "Alpha",
  description: null,
  allowThirdPartyEgress: false,
};

function mockClient(context?: CasesContext): QueryClient {
  return {
    removeQueries: vi.fn(),
    setQueryData: vi.fn((_key, updater) => {
      if (typeof updater === "function" && context) {
        return updater(context);
      }
      return updater;
    }),
  } as unknown as QueryClient;
}

describe("writeCaseRecordCache", () => {
  it("writes id and slug caches for the case row", () => {
    const client = mockClient();
    writeCaseRecordCache(client, CASE);
    expect(client.setQueryData).toHaveBeenCalledWith(
      caseByIdQuery(CASE.id).queryKey,
      CASE
    );
    expect(client.setQueryData).toHaveBeenCalledWith(
      caseBySlugQuery(CASE.slug).queryKey,
      CASE
    );
  });

  it("drops the previous slug cache when a case is renamed", () => {
    const client = mockClient();
    const renamed = { ...CASE, slug: "beta" };
    writeCaseRecordCache(client, renamed, { slug: "alpha" });
    expect(client.removeQueries).toHaveBeenCalledWith({
      queryKey: caseBySlugQuery("alpha").queryKey,
    });
  });

  it("patches the cases context list and active row", () => {
    const context: CasesContext = {
      cases: [CASE],
      active: CASE,
    };
    const client = mockClient(context);
    const updated = { ...CASE, name: "Alpha renamed" };
    writeCaseRecordCache(client, updated);
    const contextCall = vi
      .mocked(client.setQueryData)
      .mock.calls.find(
        ([key]) => JSON.stringify(key) === JSON.stringify(casesKeys.context())
      );
    const updater = contextCall?.[1];
    expect(typeof updater).toBe("function");
    const next =
      typeof updater === "function"
        ? (updater as (p: CasesContext) => CasesContext)(context)
        : null;
    expect(next?.cases[0]?.name).toBe("Alpha renamed");
    expect(next?.active?.name).toBe("Alpha renamed");
  });
});

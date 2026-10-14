import { describe, expect, it, vi } from "vitest";

const serverFn = vi.hoisted(() => vi.fn());
const onError = vi.hoisted(() => vi.fn());

vi.mock("@/domains/entities/entities.functions", () => ({
  updateEntityFieldsFn: serverFn,
}));
vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

import { useSaveEntityProse } from "@/domains/dossier/hooks/use-save-entity-prose";
import { entitiesKeys } from "@/domains/entities/entities-keys";

import {
  CASE_A,
  CASE_B,
  ENTITY_SLUG,
  SCOPE_A,
  expectReportsFailure,
  expectSettlesStartingCase,
} from "./helpers/entity-write-harness";

describe("useSaveEntityProse", () => {
  it("settles the Case the summary was saved in (from the variables) when the screen re-renders for another Case", async () => {
    const saved = { id: "saved-entity", summary: "Runs the site" };
    const { queryClient } = await expectSettlesStartingCase({
      useVerb: () => useSaveEntityProse({ onError }),
      serverFn,
      resolveWith: saved,
      variables: {
        ...SCOPE_A,
        patch: { summary: "Runs the site" },
      },
    });

    expect(
      queryClient.getQueryData(entitiesKeys.detail(CASE_A, ENTITY_SLUG))
    ).toEqual(saved);
    expect(
      queryClient.getQueryData(entitiesKeys.detail(CASE_B, ENTITY_SLUG))
    ).toEqual([]);
  });

  it("reports a rejected write and settles nothing", async () => {
    await expectReportsFailure({
      useVerb: () => useSaveEntityProse({ onError }),
      serverFn,
      variables: {
        ...SCOPE_A,
        patch: { summary: "Runs the site" },
      },
      onError,
    });
  });
});

import { describe, expect, it, vi } from "vitest";

const onError = vi.hoisted(() => vi.fn());

vi.mock("@/lib/orpc-client", async () =>
  (await import("@/testing/orpc-client")).orpcClientModuleDouble()
);
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
} from "@/domains/entities/hooks/__tests__/helpers/entity-write-harness";
import { procedureDouble } from "@/testing/orpc-client";

const updateEntity = procedureDouble("entities.update");

describe("useSaveEntityProse", () => {
  it("settles the Case the summary was saved in (from the variables) when the screen re-renders for another Case", async () => {
    const saved = { id: "saved-entity", summary: "Runs the site" };
    const { queryClient } = await expectSettlesStartingCase({
      useVerb: () => useSaveEntityProse({ onError }),
      procedure: updateEntity,
      resolveWith: saved,
      variables: {
        ...SCOPE_A,
        expectedVersion: 1,
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
      procedure: updateEntity,
      variables: {
        ...SCOPE_A,
        expectedVersion: 1,
        patch: { summary: "Runs the site" },
      },
      onError,
    });
  });
});

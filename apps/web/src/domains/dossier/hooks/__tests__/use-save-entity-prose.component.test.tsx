import { describe, it, vi } from "vitest";

vi.mock("@/auth/server", () => ({ auth: {} }));

const serverFn = vi.hoisted(() => vi.fn());
const onError = vi.hoisted(() => vi.fn());

vi.mock("@/domains/entities/entities.functions", () => ({
  updateEntityFieldsFn: serverFn,
}));
vi.mock("@/shared/ui/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { useSaveEntityProse } from "@/domains/dossier/hooks/use-save-entity-prose";

import {
  SCOPE_A,
  expectReportsFailure,
  expectSettlesStartingCase,
} from "./helpers/entity-write-harness";

describe("useSaveEntityProse", () => {
  it("settles the Case the summary was saved in after the screen moves to another Case", async () => {
    await expectSettlesStartingCase({
      useVerb: () => useSaveEntityProse({ onError }),
      serverFn,
      variables: {
        ...SCOPE_A,
        patch: { summary: "Runs the site" },
      },
    });
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

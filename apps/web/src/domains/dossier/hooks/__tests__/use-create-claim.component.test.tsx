import { describe, it, vi } from "vitest";

const serverFn = vi.hoisted(() => vi.fn());

vi.mock("@/domains/entities/claims/claims.functions", () => ({
  createClaimFn: serverFn,
}));
vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

import { useCreateClaim } from "@/domains/dossier/hooks/use-create-claim";

import {
  SCOPE_A,
  expectSettlesStartingCase,
} from "./helpers/entity-write-harness";

describe("useCreateClaim", () => {
  it("settles the Case the claim was added in (from the variables) when the screen re-renders for another Case", async () => {
    await expectSettlesStartingCase({
      useVerb: (onDone) => useCreateClaim({ onCreated: onDone }),
      serverFn,
      expectCallbackBeforeInvalidation: true,
      variables: {
        ...SCOPE_A,
        value: {
          text: "Runs the site",
          claimClass: "observation",
          confidence: "unverified",
          evidenceIds: [],
        },
      },
    });
  });
});

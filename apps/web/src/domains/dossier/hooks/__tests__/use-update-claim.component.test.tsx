import { describe, it, vi } from "vitest";

vi.mock("@/auth/server", () => ({ auth: {} }));

const serverFn = vi.hoisted(() => vi.fn());

vi.mock("@/domains/entities/claims/claims.functions", () => ({
  updateClaimFn: serverFn,
}));
vi.mock("@/shared/ui/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { useUpdateClaim } from "@/domains/dossier/hooks/use-update-claim";
import { testId } from "@watchdog/test-kit";

import {
  SCOPE_A,
  expectSettlesStartingCase,
} from "./helpers/entity-write-harness";

describe("useUpdateClaim", () => {
  it("settles the Case the claim was edited in after the screen moves to another Case", async () => {
    await expectSettlesStartingCase({
      useVerb: () => useUpdateClaim(),
      serverFn,
      variables: {
        ...SCOPE_A,
        claimId: testId(31),
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

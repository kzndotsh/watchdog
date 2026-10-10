import { describe, it, vi } from "vitest";

vi.mock("@/auth/server", () => ({ auth: {} }));

const serverFn = vi.hoisted(() => vi.fn());

vi.mock("@/domains/entities/claims/claims.functions", () => ({
  retractClaimFn: serverFn,
}));
vi.mock("@/shared/ui/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { useRetractClaim } from "@/domains/dossier/hooks/use-retract-claim";
import { testId } from "@watchdog/test-kit";

import {
  SCOPE_A,
  expectSettlesStartingCase,
} from "./helpers/entity-write-harness";

describe("useRetractClaim", () => {
  it("settles the Case the claim was retracted in (from the variables) when the screen re-renders for another Case", async () => {
    await expectSettlesStartingCase({
      useVerb: (onDone) =>
        useRetractClaim({
          successMessage: "Claim retracted",
          onRetracted: onDone,
        }),
      serverFn,
      expectCallbackBeforeInvalidation: true,
      variables: {
        ...SCOPE_A,
        claimId: testId(31),
        kind: "retracted",
        reason: "Superseded",
      },
    });
  });
});

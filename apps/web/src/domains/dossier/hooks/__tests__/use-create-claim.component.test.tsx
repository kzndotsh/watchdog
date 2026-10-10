import { describe, it, vi } from "vitest";

vi.mock("@/auth/server", () => ({ auth: {} }));

const serverFn = vi.hoisted(() => vi.fn());

vi.mock("@/domains/entities/claims/claims.functions", () => ({
  createClaimFn: serverFn,
}));
vi.mock("@/shared/ui/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { useCreateClaim } from "@/domains/dossier/hooks/use-create-claim";

import {
  SCOPE_A,
  expectSettlesStartingCase,
} from "./helpers/entity-write-harness";

describe("useCreateClaim", () => {
  it("settles the Case the claim was added in after the screen moves to another Case", async () => {
    await expectSettlesStartingCase({
      useVerb: () => useCreateClaim(),
      serverFn,
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

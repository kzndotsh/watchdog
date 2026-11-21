import { describe, it, vi } from "vitest";

vi.mock("@/lib/orpc-client", async () =>
  (await import("@/testing/orpc-client")).orpcClientModuleDouble()
);
vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

import {
  useCreateClaim,
  useRetractClaim,
  useUpdateClaim,
} from "@/domains/entities/claims/mutations";
import {
  SCOPE_A,
  expectSettlesStartingCase,
} from "@/domains/entities/hooks/__tests__/helpers/entity-write-harness";
import { procedureDouble } from "@/testing/orpc-client";
import { testId } from "@watchdog/domain/test-kit";

const procedures = {
  create: procedureDouble("claims.create"),
  retract: procedureDouble("claims.retract"),
  update: procedureDouble("claims.update"),
};

describe("claims Graph child mutations", () => {
  it("settles the Case the claim was added in (from the variables) when the screen re-renders for another Case", async () => {
    await expectSettlesStartingCase({
      useVerb: (onDone) => useCreateClaim({ onSuccess: onDone }),
      procedure: procedures.create,
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

  it("settles the Case the claim was retracted in (from the variables) when the screen re-renders for another Case", async () => {
    await expectSettlesStartingCase({
      useVerb: (onDone) =>
        useRetractClaim({
          onSuccess: onDone,
        }),
      procedure: procedures.retract,
      expectCallbackBeforeInvalidation: true,
      variables: {
        ...SCOPE_A,
        claimId: testId(31),
        kind: "retracted",
        reason: "Superseded",
      },
    });
  });

  it("settles the Case the claim was edited in (from the variables) when the screen re-renders for another Case", async () => {
    await expectSettlesStartingCase({
      useVerb: (onDone) => useUpdateClaim({ onSuccess: onDone }),
      procedure: procedures.update,
      expectCallbackBeforeInvalidation: true,
      variables: {
        ...SCOPE_A,
        expectedVersion: 1,
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

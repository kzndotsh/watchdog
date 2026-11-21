import { describe, it, vi } from "vitest";

const onError = vi.hoisted(() => vi.fn());

vi.mock("@/lib/orpc-client", async () =>
  (await import("@/testing/orpc-client")).orpcClientModuleDouble()
);
vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

import {
  SCOPE_A,
  expectSettlesStartingCase,
} from "@/domains/entities/hooks/__tests__/helpers/entity-write-harness";
import {
  useCreateIdentifier,
  useUpdateIdentifier,
} from "@/domains/entities/identifiers/mutations";
import { procedureDouble } from "@/testing/orpc-client";
import { testId } from "@watchdog/domain/test-kit";

const procedures = {
  createIdentifierFn: procedureDouble("identifiers.create"),
  updateIdentifierFn: procedureDouble("identifiers.update"),
};

describe("identifiers Graph child mutations", () => {
  it("settles the Case the identifier was added in (from the variables) when the screen re-renders for another Case", async () => {
    await expectSettlesStartingCase({
      useVerb: () => useCreateIdentifier(),
      procedure: procedures.createIdentifierFn,
      variables: {
        ...SCOPE_A,
        value: {
          type: "email",
          value: "a@example.com",
          platform: "",
          status: "current",
          confidence: "unverified",
          evidenceIds: [],
        },
      },
    });
  });

  it("settles the Case the identifier was edited in (from the variables) when the screen re-renders for another Case", async () => {
    await expectSettlesStartingCase({
      useVerb: (onDone) => useUpdateIdentifier({ onSuccess: onDone, onError }),
      procedure: procedures.updateIdentifierFn,
      expectCallbackBeforeInvalidation: true,
      variables: {
        ...SCOPE_A,
        patch: {
          expectedVersion: 1,
          identifierId: testId(34),
          value: "b@example.com",
        },
      },
    });
  });
});

import { describe, it, vi } from "vitest";

const fns = vi.hoisted(() => ({
  createIdentifierFn: vi.fn(),
  updateIdentifierFn: vi.fn(),
}));
const onError = vi.hoisted(() => vi.fn());

vi.mock("@/domains/entities/identifiers/identifiers.functions", () => fns);
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
import { testId } from "@watchdog/test-kit";

describe("identifiers Graph child mutations", () => {
  it("settles the Case the identifier was added in (from the variables) when the screen re-renders for another Case", async () => {
    await expectSettlesStartingCase({
      useVerb: () => useCreateIdentifier(),
      serverFn: fns.createIdentifierFn,
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
      serverFn: fns.updateIdentifierFn,
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

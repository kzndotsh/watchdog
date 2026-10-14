import { describe, it, vi } from "vitest";

const serverFn = vi.hoisted(() => vi.fn());
const onError = vi.hoisted(() => vi.fn());

vi.mock("@/domains/entities/identifiers/identifiers.functions", () => ({
  updateIdentifierFn: serverFn,
}));
vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

import { useUpdateIdentifier } from "@/domains/dossier/hooks/use-update-identifier";
import { testId } from "@watchdog/test-kit";

import {
  SCOPE_A,
  expectReportsFailure,
  expectSettlesStartingCase,
} from "./helpers/entity-write-harness";

describe("useUpdateIdentifier", () => {
  it("settles the Case the identifier was edited in (from the variables) when the screen re-renders for another Case", async () => {
    await expectSettlesStartingCase({
      useVerb: (onDone) => useUpdateIdentifier({ onUpdated: onDone, onError }),
      serverFn,
      expectCallbackBeforeInvalidation: true,
      variables: {
        ...SCOPE_A,
        patch: {
          identifierId: testId(34),
          value: "b@example.com",
        },
      },
    });
  });

  it("reports a rejected write and settles nothing", async () => {
    await expectReportsFailure({
      useVerb: () => useUpdateIdentifier({ onError }),
      serverFn,
      variables: {
        ...SCOPE_A,
        patch: {
          identifierId: testId(34),
          value: "b@example.com",
        },
      },
      onError,
    });
  });
});

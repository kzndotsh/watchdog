import { describe, it, vi } from "vitest";

const serverFn = vi.hoisted(() => vi.fn());
const onError = vi.hoisted(() => vi.fn());

vi.mock("@/domains/entities/edges/edges.functions", () => ({
  deleteEdgeFn: serverFn,
}));
vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

import { useDeleteConnection } from "@/domains/dossier/hooks/use-delete-connection";
import { testId } from "@watchdog/test-kit";

import {
  SCOPE_A,
  expectReportsFailure,
  expectSettlesStartingCase,
} from "./helpers/entity-write-harness";

describe("useDeleteConnection", () => {
  it("settles the Case the connection was deleted in (from the variables) when the screen re-renders for another Case", async () => {
    await expectSettlesStartingCase({
      useVerb: (onDone) => useDeleteConnection({ onDeleted: onDone, onError }),
      serverFn,
      expectCallbackBeforeInvalidation: true,
      variables: {
        ...SCOPE_A,
        edgeId: testId(32),
      },
    });
  });

  it("reports a rejected write and settles nothing", async () => {
    await expectReportsFailure({
      useVerb: () => useDeleteConnection({ onError }),
      serverFn,
      variables: {
        ...SCOPE_A,
        edgeId: testId(32),
      },
      onError,
    });
  });
});

import { describe, it, vi } from "vitest";

vi.mock("@/auth/server", () => ({ auth: {} }));

const serverFn = vi.hoisted(() => vi.fn());
const onError = vi.hoisted(() => vi.fn());

vi.mock("@/domains/entities/edges/edges.functions", () => ({
  createEdgeFn: serverFn,
}));
vi.mock("@/shared/ui/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { useCreateConnection } from "@/domains/dossier/hooks/use-create-connection";
import { testId } from "@watchdog/test-kit";

import {
  SCOPE_A,
  expectReportsFailure,
  expectSettlesStartingCase,
} from "./helpers/entity-write-harness";

describe("useCreateConnection", () => {
  it("settles the Case the connection was added in (from the variables) when the screen re-renders for another Case", async () => {
    await expectSettlesStartingCase({
      useVerb: (onDone) => useCreateConnection({ onCreated: onDone, onError }),
      serverFn,
      expectCallbackBeforeInvalidation: true,
      variables: {
        ...SCOPE_A,
        values: {
          peerId: testId(21),
          predicate: "operates",
          orientation: "forward",
          notes: "",
          confidence: "unverified",
          evidenceIds: [],
        },
      },
    });
  });

  it("reports a rejected write and settles nothing", async () => {
    await expectReportsFailure({
      useVerb: () => useCreateConnection({ onError }),
      serverFn,
      variables: {
        ...SCOPE_A,
        values: {
          peerId: testId(21),
          predicate: "operates",
          orientation: "forward",
          notes: "",
          confidence: "unverified",
          evidenceIds: [],
        },
      },
      onError,
    });
  });
});

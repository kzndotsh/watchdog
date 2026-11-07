import { describe, it, vi } from "vitest";

const fns = vi.hoisted(() => ({
  createEdgeFn: vi.fn(),
  deleteEdgeFn: vi.fn(),
  updateEdgeFn: vi.fn(),
}));
const onError = vi.hoisted(() => vi.fn());

vi.mock("@/domains/entities/edges/edges.functions", () => fns);
vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

import {
  useCreateConnection,
  useDeleteConnection,
  useUpdateConnection,
} from "@/domains/entities/edges/mutations";
import type { EdgeRecord } from "@/domains/entities/edges/types";
import {
  ENTITY_ID,
  SCOPE_A,
  expectSettlesStartingCase,
} from "@/domains/entities/hooks/__tests__/helpers/entity-write-harness";
import { testId } from "@watchdog/test-kit";

const EDGE: EdgeRecord = {
  version: 1,
  id: testId(32),
  fromId: ENTITY_ID,
  toId: testId(21),
  predicate: "operates",
  confidence: "unverified",
  notes: null,
  evidenceIds: [],
  peerId: testId(21),
  peerName: "Peer",
  peerSlug: "peer",
  peerKind: "person",
  direction: "out",
};

describe("edges Graph child mutations", () => {
  it("settles the Case the connection was added in (from the variables) when the screen re-renders for another Case", async () => {
    await expectSettlesStartingCase({
      useVerb: (onDone) => useCreateConnection({ onSuccess: onDone, onError }),
      serverFn: fns.createEdgeFn,
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

  it("settles the Case the connection was deleted in (from the variables) when the screen re-renders for another Case", async () => {
    await expectSettlesStartingCase({
      useVerb: (onDone) => useDeleteConnection({ onSuccess: onDone, onError }),
      serverFn: fns.deleteEdgeFn,
      expectCallbackBeforeInvalidation: true,
      variables: {
        ...SCOPE_A,
        edgeId: testId(32),
      },
    });
  });

  it("settles the Case the connection was edited in (from the variables) when the screen re-renders for another Case", async () => {
    await expectSettlesStartingCase({
      useVerb: (onDone) => useUpdateConnection({ onSuccess: onDone, onError }),
      serverFn: fns.updateEdgeFn,
      expectCallbackBeforeInvalidation: true,
      variables: {
        ...SCOPE_A,
        expectedVersion: 1,
        edge: EDGE,
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
});

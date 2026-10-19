import { describe, it, vi } from "vitest";

const serverFn = vi.hoisted(() => vi.fn());
const onError = vi.hoisted(() => vi.fn());

vi.mock("@/domains/entities/edges/edges.functions", () => ({
  updateEdgeFn: serverFn,
}));
vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

import { useUpdateConnection } from "@/domains/dossier/hooks/use-update-connection";
import type { EdgeRecord } from "@/domains/entities/edges/types";
import { testId } from "@watchdog/test-kit";

import {
  ENTITY_ID,
  SCOPE_A,
  expectReportsFailure,
  expectSettlesStartingCase,
} from "./helpers/entity-write-harness";

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

describe("useUpdateConnection", () => {
  it("settles the Case the connection was edited in (from the variables) when the screen re-renders for another Case", async () => {
    await expectSettlesStartingCase({
      useVerb: (onDone) => useUpdateConnection({ onUpdated: onDone, onError }),
      serverFn,
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

  it("reports a rejected write and settles nothing", async () => {
    await expectReportsFailure({
      useVerb: () => useUpdateConnection({ onError }),
      serverFn,
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
      onError,
    });
  });
});

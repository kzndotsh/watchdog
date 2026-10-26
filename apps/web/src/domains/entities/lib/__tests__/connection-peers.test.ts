import { describe, expect, it } from "vitest";

import { buildCaseEdgeRecord } from "@/testing/records";
import { testId } from "@watchdog/test-kit/fixtures";

import { edgeFromEntity } from "../connection-peers.ts";

describe("edgeFromEntity", () => {
  const row = buildCaseEdgeRecord({
    fromId: testId(1),
    fromName: "Acme Ltd",
    fromSlug: "acme-ltd",
    fromKind: "org",
    toId: testId(2),
    toName: "John Doe",
    toSlug: "john-doe",
    toKind: "person",
  });

  it("names the other end as the peer, outbound from the source", () => {
    expect(edgeFromEntity(row, testId(1))).toMatchObject({
      direction: "out",
      peerId: testId(2),
      peerName: "John Doe",
      peerSlug: "john-doe",
      peerKind: "person",
    });
  });

  it("is inbound from the target, with the source as the peer", () => {
    expect(edgeFromEntity(row, testId(2))).toMatchObject({
      direction: "in",
      peerId: testId(1),
      peerName: "Acme Ltd",
      peerKind: "org",
    });
  });
});

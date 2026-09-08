import { describe, expect, it } from "vitest";

import { connectionComposerIssues } from "@/domains/entities/lib/connection-composer";

const BASE = {
  peerId: "peer-1",
  phraseValue: "operates:forward",
  notes: "",
};

describe("connectionComposerIssues", () => {
  it("rejects self-linked connections", () => {
    expect(
      connectionComposerIssues({ ...BASE, peerId: "center-1" }, "center-1")
    ).toBe("Cannot connect an entity to itself");
  });

  it("requires notes for related_to", () => {
    expect(
      connectionComposerIssues({
        ...BASE,
        phraseValue: "related_to:forward",
        notes: "  ",
      })
    ).toMatch(/related_to/);
  });

  it("rejects whitespace-only peer selection", () => {
    expect(
      connectionComposerIssues({
        ...BASE,
        peerId: "   ",
      })
    ).toBe("Select a peer entity");
  });
});

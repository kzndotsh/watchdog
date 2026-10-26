import { describe, it, expect } from "vitest";

import { entityDisplayLabel } from "@watchdog/schemas/shared";

import { sortEdgesByPeerLabel } from "../connection-peers.ts";

describe("connection-peers", () => {
  it("entityDisplayLabel trims name and falls back to slug", () => {
    expect(entityDisplayLabel({ name: "  Alpha  ", slug: "alpha-corp" })).toBe(
      "Alpha"
    );
    expect(entityDisplayLabel({ name: "  ", slug: "alpha-corp" })).toBe(
      "alpha-corp"
    );
  });

  it("sortEdgesByPeerLabel orders by display label and falls back to slug", () => {
    const sorted = sortEdgesByPeerLabel([
      {
        id: "e3",
        peerName: "Zeta Corp",
        peerSlug: "zeta",
        direction: "out",
      },
      {
        id: "e1",
        peerName: "",
        peerSlug: "alpha",
        direction: "out",
      },
      {
        id: "e2",
        peerName: "Beta LLC",
        peerSlug: "beta",
        direction: "out",
      },
    ]);

    expect(sorted.map((edge) => edge.id)).toEqual(["e1", "e2", "e3"]);
  });
});

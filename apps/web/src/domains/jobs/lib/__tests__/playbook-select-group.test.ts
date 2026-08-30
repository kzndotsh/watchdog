import { describe, expect, it } from "vitest";

import {
  groupPlaybooksBySeed,
  playbookMatchesQuery,
} from "@/domains/jobs/lib/playbook-select-group";
import type { PlaybookListItem } from "@/domains/jobs/types";

function playbook(overrides: Partial<PlaybookListItem> = {}): PlaybookListItem {
  return {
    id: "host-footprint-lite",
    title: "Host footprint lite",
    description: "DNS only",
    seedKinds: ["host"],
    steps: ["network.dns.lookup"],
    requires: {
      credentials: [],
      egress: "none",
      flags: [],
    },
    ...overrides,
  };
}

describe("playbook-select-group", () => {
  it("groups playbooks by primary seed kind", () => {
    const groups = groupPlaybooksBySeed([
      playbook({
        id: "url-reputation",
        title: "URL reputation",
        seedKinds: ["url"],
      }),
      playbook(),
    ]);

    expect(groups.map((group) => group.label)).toEqual(["Host", "URL"]);
    expect(groups[0]?.playbooks[0]?.id).toBe("host-footprint-lite");
  });

  it("matches playbook title, id, and steps in search", () => {
    const row = playbook();
    expect(playbookMatchesQuery(row, "footprint")).toBe(true);
    expect(playbookMatchesQuery(row, "network.dns")).toBe(true);
    expect(playbookMatchesQuery(row, "missing")).toBe(false);
  });
});

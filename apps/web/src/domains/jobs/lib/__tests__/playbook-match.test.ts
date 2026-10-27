import { describe, expect, it } from "vitest";

import {
  matchPlaybooks,
  playbookRequiresKey,
  playbookPickUrlDump,
} from "@/domains/jobs/lib/playbook-match";
import type { PlaybookListItem } from "@/domains/jobs/types";

function playbook(overrides: Partial<PlaybookListItem> = {}): PlaybookListItem {
  return {
    id: "host-footprint",
    title: "Host footprint",
    description: "DNS only",
    seedKinds: ["host"],
    steps: ["network.dns.lookup"],
    stepDependencies: [[]],
    requires: {
      credentials: [],
      egress: ["local"],
      contacts: [],
      flags: [],
    },
    ...overrides,
  };
}

describe("playbook-match", () => {
  it("filters by seed kind", () => {
    const rows = matchPlaybooks(
      [
        playbook(),
        playbook({
          id: "url-reputation",
          title: "URL reputation",
          seedKinds: ["url"],
        }),
      ],
      {
        seeds: ["url"],
        egress: [],
        isKeyOnlyNeeded: false,
        isUrlDumpOnly: false,
      }
    );

    expect(rows.map((row) => row.id)).toEqual(["url-reputation"]);
  });

  it("filters keyed and url-dump playbooks", () => {
    const keyed = playbook({
      id: "ip-exposure",
      seedKinds: ["ip"],
      requires: {
        credentials: [{ name: "shodan" }],
        egress: ["account_lookup"],
        contacts: [
          { kind: "provider", host: "api.vendor.test", access: "keyed" },
        ],
        flags: [],
      },
    });
    const urlDump = playbook({
      id: "url-capture",
      seedKinds: ["url", "evidence"],
    });

    expect(playbookRequiresKey(keyed)).toBe(true);
    expect(playbookPickUrlDump(urlDump)).toBe(true);

    expect(
      matchPlaybooks([keyed, urlDump], {
        seeds: [],
        egress: [],
        isKeyOnlyNeeded: true,
        isUrlDumpOnly: false,
      }).map((row) => row.id)
    ).toEqual(["ip-exposure"]);

    expect(
      matchPlaybooks([keyed, urlDump], {
        seeds: [],
        egress: [],
        isKeyOnlyNeeded: false,
        isUrlDumpOnly: true,
      }).map((row) => row.id)
    ).toEqual(["url-capture"]);
  });
});

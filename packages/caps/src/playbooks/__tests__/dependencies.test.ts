import { describe, expect, it } from "vitest";

import "../../registry.ts";
import { playbookStepDependencies } from "../dependencies.ts";
import {
  PLAYBOOKS,
  listPlaybookDescriptors,
  requirePlaybook,
  type PlaybookDef,
} from "../index.ts";

function synthetic(steps: PlaybookDef["steps"]): PlaybookDef {
  return {
    id: "synthetic",
    title: "Synthetic",
    description: "Synthetic recipe",
    seedKinds: ["host"],
    steps,
  };
}

const bindTo = (step: number) => ({
  capabilityId: "evidence.harvest",
  bind: { evidenceId: { step, bag: "evidenceId" as const } },
});

describe("playbookStepDependencies: shipped Playbooks", () => {
  it("makes the timing-only books independent", () => {
    for (const id of ["host-footprint", "ip-context", "url-capture"]) {
      const deps = playbookStepDependencies(requirePlaybook(id));
      expect(deps.every((d) => d.length === 0)).toBe(true);
    }
  });

  it("reads host-contacts, url-resolve and evidence-file step 1 from step 0", () => {
    for (const id of ["host-contacts", "url-resolve", "evidence-file"]) {
      expect(playbookStepDependencies(requirePlaybook(id))).toEqual([[], [0]]);
    }
  });

  it("reads the host-enumerate fan-out from the CT step", () => {
    expect(playbookStepDependencies(requirePlaybook("host-enumerate"))).toEqual(
      [[], [0]]
    );
  });

  it("only depends on earlier steps, in ascending order, for every book", () => {
    for (const playbook of PLAYBOOKS) {
      const deps = playbookStepDependencies(playbook);
      expect(deps).toHaveLength(playbook.steps.length);
      for (const [step, list] of deps.entries()) {
        expect(list.every((d) => d < step)).toBe(true);
        expect(list).toEqual([...list].sort((a, b) => a - b));
      }
    }
  });
});

describe("playbookStepDependencies: synthetic Playbooks", () => {
  it("gives a plain step, or one bound only to the seed, no dependencies", () => {
    const deps = playbookStepDependencies(
      synthetic([
        "network.dns.lookup",
        {
          capabilityId: "network.whois.lookup",
          bind: { host: { seed: "host" } },
        },
      ])
    );
    expect(deps).toEqual([[], []]);
  });

  it("closes the relation transitively", () => {
    expect(
      playbookStepDependencies(
        synthetic(["network.dns.lookup", bindTo(0), bindTo(1), bindTo(2)])
      )
    ).toEqual([[], [0], [0, 1], [0, 1, 2]]);
  });

  it("keeps an independent step out of a dependent chain", () => {
    expect(
      playbookStepDependencies(
        synthetic([
          "network.dns.lookup",
          "network.whois.lookup",
          bindTo(0),
          bindTo(2),
        ])
      )
    ).toEqual([[], [], [0], [0, 2]]);
  });

  it("merges several sources and counts a fan-out source", () => {
    const deps = playbookStepDependencies(
      synthetic([
        "network.dns.lookup",
        "network.ct.lookup",
        {
          capabilityId: "evidence.harvest",
          bind: {
            evidenceId: { step: 0, bag: "evidenceId" },
            url: { step: 1, bag: "url" },
            host: { seed: "host" },
          },
        },
        {
          capabilityId: "network.dns.lookup",
          fanOut: { from: { step: 1, bag: "host" }, to: "host" },
        },
      ])
    );
    expect(deps).toEqual([[], [], [0, 1], [1]]);
  });
});

describe("listPlaybookDescriptors: the catalog carries the dependencies", () => {
  it("returns one dependency row per step, matching playbookStepDependencies", () => {
    for (const entry of listPlaybookDescriptors()) {
      expect(entry.stepDependencies).toEqual(
        playbookStepDependencies(requirePlaybook(entry.id))
      );
      expect(entry.stepDependencies).toHaveLength(entry.steps.length);
    }
  });
});

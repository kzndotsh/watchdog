import { describe, expect, it } from "vitest";

import "../../registry.ts";
import {
  decidePlaybookAdvance,
  playbookStepViews,
  requirePlaybook,
  predecessorFromJob,
  type PlaybookDef,
} from "../index.ts";

describe("decidePlaybookAdvance", () => {
  it("waits while the current step is still open", () => {
    const decision = decidePlaybookAdvance(
      requirePlaybook("host-footprint"),
      { host: "example.com" },
      [{ step: 0, status: "running" }],
      []
    );
    expect(decision).toEqual({ kind: "wait" });
  });

  it("waits while the current step is queued", () => {
    const decision = decidePlaybookAdvance(
      requirePlaybook("host-footprint"),
      { host: "example.com" },
      [{ step: 0, status: "queued" }],
      []
    );
    expect(decision).toEqual({ kind: "wait" });
  });

  it("enqueues step 0 when the row is missing", () => {
    const decision = decidePlaybookAdvance(
      requirePlaybook("host-footprint"),
      { host: "example.com" },
      [],
      []
    );
    expect(decision.kind).toBe("enqueue");
    if (decision.kind !== "enqueue") return;
    expect(decision.step).toBe(0);
  });

  it("enqueues the next linear step after success", () => {
    const decision = decidePlaybookAdvance(
      requirePlaybook("host-footprint"),
      { host: "example.com" },
      [{ step: 0, status: "succeeded" }],
      []
    );
    expect(decision.kind).toBe("enqueue");
    if (decision.kind !== "enqueue") return;
    expect(decision.step).toBe(1);
    expect(decision.inputs).toHaveLength(1);
    expect(decision.inputs[0]?.host).toBe("example.com");
  });

  it("enqueues a bind step after success", () => {
    const evidenceId = "00000000-0000-4000-8000-00000000aaa1";
    const decision = decidePlaybookAdvance(
      requirePlaybook("host-contacts"),
      { host: "example.com" },
      [{ step: 0, status: "succeeded" }],
      [
        predecessorFromJob({
          playbookStep: 0,
          evidenceIds: [evidenceId],
          handoff: {},
        }),
      ]
    );
    expect(decision.kind).toBe("enqueue");
    if (decision.kind !== "enqueue") return;
    expect(decision.step).toBe(1);
    expect(decision.inputs[0]?.evidenceId).toBe(evidenceId);
  });

  it("fans out DNS after CT succeeds with host handoff", () => {
    const decision = decidePlaybookAdvance(
      requirePlaybook("host-enumerate"),
      { host: "example.com" },
      [{ step: 0, status: "succeeded" }],
      [
        predecessorFromJob({
          playbookStep: 0,
          evidenceIds: [],
          handoff: { host: ["a.example.com", "b.example.com"] },
        }),
      ]
    );
    expect(decision.kind).toBe("enqueue");
    if (decision.kind !== "enqueue") return;
    expect(decision.step).toBe(1);
    expect(decision.inputs).toHaveLength(2);
  });

  it("enqueues the next step after a failed linear step: steps are independent unless bound", () => {
    const decision = decidePlaybookAdvance(
      requirePlaybook("host-footprint"),
      { host: "example.com" },
      [{ step: 0, status: "failed" }],
      []
    );
    expect(decision.kind).toBe("enqueue");
    if (decision.kind !== "enqueue") return;
    expect(decision.step).toBe(1);
  });

  it("finishes failed when every step failed", () => {
    const decision = decidePlaybookAdvance(
      requirePlaybook("host-posture"),
      { host: "example.com" },
      [
        { step: 0, status: "failed" },
        { step: 1, status: "cancelled" },
      ],
      []
    );
    expect(decision).toEqual({ kind: "finish", outcome: "failed" });
  });

  it("finishes succeeded when every step succeeded", () => {
    const decision = decidePlaybookAdvance(
      requirePlaybook("host-posture"),
      { host: "example.com" },
      [
        { step: 0, status: "succeeded" },
        { step: 1, status: "succeeded" },
      ],
      []
    );
    expect(decision).toEqual({ kind: "finish", outcome: "succeeded" });
  });

  it("finishes partial when the final step failed", () => {
    const decision = decidePlaybookAdvance(
      requirePlaybook("host-posture"),
      { host: "example.com" },
      [
        { step: 0, status: "succeeded" },
        { step: 1, status: "failed" },
      ],
      []
    );
    expect(decision).toEqual({ kind: "finish", outcome: "partial" });
  });

  it("counts a failed fan-out input parse as that step failing, not the run", () => {
    const playbook: PlaybookDef = {
      ...requirePlaybook("host-enumerate"),
      steps: [
        "network.ct.lookup",
        {
          capabilityId: "identity.email.lookup",
          fanOut: {
            from: { step: 0, bag: "host" as const },
            to: "entityId",
            max: 25,
          },
        },
      ],
    };
    const jobs = [{ step: 0, status: "succeeded" as const }];
    const predecessors = [
      predecessorFromJob({
        playbookStep: 0,
        evidenceIds: [],
        handoff: { host: ["a.example.com"] },
      }),
    ];
    expect(
      decidePlaybookAdvance(
        playbook,
        { host: "example.com" },
        jobs,
        predecessors
      )
    ).toEqual({ kind: "finish", outcome: "partial" });
    const views = playbookStepViews(
      playbook,
      { host: "example.com" },
      jobs,
      predecessors
    );
    expect(views[1]?.state).toBe("failed");
    expect(views[1]?.reason).toMatch(/invalid input/i);
  });

  it("completes a zero-input fan-out step and finishes the run succeeded", () => {
    const decision = decidePlaybookAdvance(
      requirePlaybook("host-enumerate"),
      { host: "example.com" },
      [{ step: 0, status: "succeeded" }],
      [
        predecessorFromJob({
          playbookStep: 0,
          evidenceIds: [],
          handoff: { host: [] },
        }),
      ]
    );
    expect(decision).toEqual({ kind: "finish", outcome: "succeeded" });
  });
});

const EVIDENCE = "00000000-0000-4000-8000-00000000aaa1";
const SEED = { host: "example.com" };

/** Step 1 is independent of step 0; step 2 reads step 0's Evidence. */
const independentChain: PlaybookDef = {
  id: "synthetic-chain",
  title: "Synthetic",
  description: "Step 1 is independent; step 2 depends on step 0.",
  seedKinds: ["host"],
  steps: [
    "network.dns.lookup",
    "network.whois.lookup",
    {
      capabilityId: "evidence.harvest",
      bind: { evidenceId: { step: 0, bag: "evidenceId" } },
    },
  ],
};

const withEvidence = predecessorFromJob({
  playbookStep: 0,
  evidenceIds: [EVIDENCE],
  handoff: {},
});

describe("a failing Cap in the middle of an independent chain", () => {
  it("runs the independent step after step 0 fails", () => {
    const decision = decidePlaybookAdvance(
      independentChain,
      SEED,
      [{ step: 0, status: "failed" }],
      []
    );
    expect(decision.kind).toBe("enqueue");
    if (decision.kind !== "enqueue") return;
    expect(decision.step).toBe(1);
  });

  it("waits while the independent step runs", () => {
    expect(
      decidePlaybookAdvance(
        independentChain,
        SEED,
        [
          { step: 0, status: "failed" },
          { step: 1, status: "running" },
        ],
        []
      )
    ).toEqual({ kind: "wait" });
  });

  it("skips the dependent step and finishes partial", () => {
    const jobs = [
      { step: 0, status: "failed" as const },
      { step: 1, status: "succeeded" as const },
    ];
    expect(decidePlaybookAdvance(independentChain, SEED, jobs, [])).toEqual({
      kind: "finish",
      outcome: "partial",
    });
    expect(playbookStepViews(independentChain, SEED, jobs, [])).toEqual([
      { step: 0, capabilityId: "network.dns.lookup", state: "failed" },
      { step: 1, capabilityId: "network.whois.lookup", state: "succeeded" },
      {
        step: 2,
        capabilityId: "evidence.harvest",
        state: "skipped",
        blockedBy: 0,
      },
    ]);
  });

  it("finishes failed when the independent step fails too", () => {
    expect(
      decidePlaybookAdvance(
        independentChain,
        SEED,
        [
          { step: 0, status: "failed" },
          { step: 1, status: "failed" },
        ],
        []
      )
    ).toEqual({ kind: "finish", outcome: "failed" });
  });

  it("runs the dependent step when step 0 succeeded", () => {
    const decision = decidePlaybookAdvance(
      independentChain,
      SEED,
      [
        { step: 0, status: "succeeded" },
        { step: 1, status: "failed" },
      ],
      [withEvidence]
    );
    expect(decision.kind).toBe("enqueue");
    if (decision.kind !== "enqueue") return;
    expect(decision.step).toBe(2);
    expect(decision.inputs[0]?.evidenceId).toBe(EVIDENCE);
  });

  it("counts a bind that cannot be built as that step failing", () => {
    const jobs = [
      { step: 0, status: "succeeded" as const },
      { step: 1, status: "succeeded" as const },
    ];
    const noEvidence = [
      predecessorFromJob({ playbookStep: 0, evidenceIds: [], handoff: {} }),
    ];
    expect(
      decidePlaybookAdvance(independentChain, SEED, jobs, noEvidence)
    ).toEqual({ kind: "finish", outcome: "partial" });
    const views = playbookStepViews(independentChain, SEED, jobs, noEvidence);
    expect(views[2]?.state).toBe("failed");
    expect(views[2]?.reason).toMatch(/invalid input/i);
  });

  it("un-skips the dependent when step 0 is retried, and runs it once the retry succeeds", () => {
    const retrying = [
      { step: 0, status: "failed" as const },
      { step: 0, status: "queued" as const },
      { step: 1, status: "succeeded" as const },
    ];
    expect(decidePlaybookAdvance(independentChain, SEED, retrying, [])).toEqual(
      { kind: "wait" }
    );
    expect(
      playbookStepViews(independentChain, SEED, retrying, []).map(
        (view) => view.state
      )
    ).toEqual(["running", "succeeded", "pending"]);

    const decision = decidePlaybookAdvance(
      independentChain,
      SEED,
      [
        { step: 0, status: "failed" },
        { step: 0, status: "succeeded" },
        { step: 1, status: "succeeded" },
      ],
      [withEvidence]
    );
    expect(decision.kind).toBe("enqueue");
    if (decision.kind !== "enqueue") return;
    expect(decision.step).toBe(2);
  });

  it("skips every transitive dependent of a failed step", () => {
    const chain: PlaybookDef = {
      ...independentChain,
      steps: [
        "network.dns.lookup",
        {
          capabilityId: "evidence.harvest",
          bind: { evidenceId: { step: 0, bag: "evidenceId" } },
        },
        {
          capabilityId: "evidence.harvest",
          bind: { evidenceId: { step: 1, bag: "evidenceId" } },
        },
        "network.whois.lookup",
      ],
    };
    const views = playbookStepViews(
      chain,
      SEED,
      [{ step: 0, status: "failed" }],
      []
    );
    expect(views.map((view) => view.state)).toEqual([
      "failed",
      "skipped",
      "skipped",
      "pending",
    ]);
    expect(views[2]?.blockedBy).toBe(0);
  });

  it("keeps going past a zero-input fan-out", () => {
    const playbook: PlaybookDef = {
      ...independentChain,
      steps: [
        "network.ct.lookup",
        {
          capabilityId: "network.dns.lookup",
          fanOut: { from: { step: 0, bag: "host" }, to: "host" },
        },
        "network.whois.lookup",
      ],
    };
    const decision = decidePlaybookAdvance(
      playbook,
      SEED,
      [{ step: 0, status: "succeeded" }],
      [predecessorFromJob({ playbookStep: 0, handoff: { host: [] } })]
    );
    expect(decision.kind).toBe("enqueue");
    if (decision.kind !== "enqueue") return;
    expect(decision.step).toBe(2);
  });

  it("treats a fan-out step with one succeeded sibling as succeeded", () => {
    const views = playbookStepViews(
      requirePlaybook("host-enumerate"),
      SEED,
      [
        { step: 0, status: "succeeded" },
        { step: 1, status: "failed" },
        { step: 1, status: "succeeded" },
      ],
      []
    );
    expect(views.map((view) => view.state)).toEqual(["succeeded", "succeeded"]);
  });
});

describe("playbookStepViews", () => {
  it("lists every step pending before the run starts", () => {
    expect(
      playbookStepViews(independentChain, SEED, [], []).map(
        (view) => view.state
      )
    ).toEqual(["pending", "pending", "pending"]);
  });

  it("marks a step with an open Job running and the rest pending", () => {
    expect(
      playbookStepViews(
        independentChain,
        SEED,
        [{ step: 0, status: "running" }],
        []
      ).map((view) => view.state)
    ).toEqual(["running", "pending", "pending"]);
  });

  it("carries the step index and Cap id", () => {
    expect(
      playbookStepViews(requirePlaybook("host-posture"), SEED, [], []).map(
        ({ step, capabilityId }) => ({ step, capabilityId })
      )
    ).toEqual([
      { step: 0, capabilityId: "network.host.tls_audit" },
      { step: 1, capabilityId: "network.host.http_probe" },
    ]);
  });
});

describe("every Job status combination of an independent chain", () => {
  const statuses = [
    undefined,
    "queued",
    "running",
    "succeeded",
    "failed",
    "cancelled",
  ] as const;
  const open = new Set<string>(["queued", "running"]);

  const cases = statuses.flatMap((a) =>
    statuses.flatMap((b) => statuses.map((c) => [a, b, c] as const))
  );

  function expectedState(status: string) {
    if (open.has(status)) return "running";
    return status === "succeeded" ? "succeeded" : "failed";
  }

  it.each(cases)("steps %s / %s / %s never abandon the run", (a, b, c) => {
    const given = [a, b, c];
    const jobs = given.flatMap((status, step) =>
      status === undefined ? [] : [{ step, status }]
    );
    const decision = decidePlaybookAdvance(independentChain, SEED, jobs, [
      withEvidence,
    ]);
    const views = playbookStepViews(independentChain, SEED, jobs, [
      withEvidence,
    ]);
    if (jobs.some((job) => open.has(job.status))) {
      expect(decision).toEqual({ kind: "wait" });
    }
    if (decision.kind === "finish") {
      const states = views.map((view) => view.state);
      expect(states).not.toContain("pending");
      expect(states).not.toContain("running");
    }
    if (decision.kind === "enqueue") {
      expect(views[decision.step]?.state).toBe("pending");
      expect(views.slice(0, decision.step).map((v) => v.state)).not.toContain(
        "pending"
      );
    }
    // A step with a Job reports its Jobs, whatever its dependencies did.
    for (const [step, status] of given.entries()) {
      if (status === undefined) continue;
      expect(views[step]?.state).toBe(expectedState(status));
    }
  });
});

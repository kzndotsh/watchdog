import { describe, expect, it } from "vitest";

import {
  applyCollectFilterToggle,
  filterCollectRows,
  resolveCollectSelection,
} from "@/domains/collect/lib/collect-filters";
import type { CollectRow } from "@/domains/collect/types";
import type { EvidenceRecord } from "@/domains/intake/types";
import type { JobListRecord } from "@/domains/jobs/types";
import { testId } from "@watchdog/test-kit";

function evidence(overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    id: testId(40),
    caseId: testId(10),
    entityId: null,
    kind: "attestation",
    label: "note.txt",
    notes: null,
    mime: "text/plain",
    uri: null,
    sha256: null,
    text: "hello",
    sourceUrl: null,
    actorId: "test-actor",
    actorLabel: "test-actor",
    capturedAt: "2026-01-02T00:00:00.000Z",
    processedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

function job(overrides: Partial<JobListRecord> = {}): JobListRecord {
  return {
    id: testId(11),
    caseId: testId(10),
    capabilityId: "network.dns.lookup",
    status: "running",
    input: { host: "example.com" },
    createdAt: "2026-01-03T00:00:00.000Z",
    updatedAt: "2026-01-03T00:00:00.000Z",
    startedAt: "2026-01-03T00:00:01.000Z",
    finishedAt: null,
    error: null,
    interpretError: null,
    proposalId: null,
    resultSummary: null,
    fromCache: false,
    suppressedCount: 0,
    playbookRunId: null,
    playbookId: null,
    playbookRunStatus: null,
    playbookStep: null,
    evidenceIds: [],
    output: [],
    actorId: "test-actor",
    actorLabel: "test-actor",
    playbookFanIndex: 0,
    ...overrides,
  };
}

function row(overrides: Partial<CollectRow> = {}): CollectRow {
  const evidenceRow = evidence();
  return {
    id: evidenceRow.id,
    title: evidenceRow.label ?? evidenceRow.id,
    hint: null,
    state: "unprocessed",
    when: evidenceRow.capturedAt,
    entityId: evidenceRow.entityId,
    evidence: evidenceRow,
    runs: [],
    playbookRunId: null,
    recipe: null,
    ...overrides,
  };
}

describe("filterCollectRows", () => {
  const rows = [
    row({
      id: testId(1),
      title: "unprocessed unattached",
      state: "unprocessed",
      evidence: evidence({ id: testId(1), entityId: null, processedAt: null }),
      entityId: null,
    }),
    row({
      id: testId(2),
      title: "processed attached",
      state: "landed",
      evidence: evidence({
        id: testId(2),
        entityId: testId(20),
        processedAt: "2026-01-04T00:00:00.000Z",
      }),
      entityId: testId(20),
    }),
    row({
      id: testId(3),
      title: "running cap",
      state: "running",
      evidence: null,
      runs: [{ job: job({ id: testId(12) }), role: "collect" }],
    }),
    row({
      id: testId(4),
      title: "cancelled cap",
      state: "cancelled",
      evidence: null,
      runs: [
        {
          job: job({
            id: testId(14),
            status: "cancelled",
            capabilityId: "network.shodan.lookup",
            input: { ip: "198.51.100.2" },
          }),
          role: "collect",
        },
      ],
    }),
    row({
      id: testId(5),
      title: "blocked cap",
      state: "blocked",
      evidence: null,
      runs: [
        {
          job: job({
            id: testId(16),
            status: "blocked",
            capabilityId: "network.censys.lookup",
            input: { host: "blocked.example" },
          }),
          role: "collect",
        },
      ],
    }),
  ];

  it("filters unprocessed evidence rows", () => {
    const out = filterCollectRows(rows, {
      q: "",
      states: [],
      hiddenOnly: false,
      unprocessedOnly: true,
      unattachedOnly: false,
      capabilityIds: [],
    });
    expect(out.map((item) => item.id)).toEqual([testId(1)]);
  });

  it("filters unattached evidence rows", () => {
    const out = filterCollectRows(rows, {
      q: "",
      states: [],
      hiddenOnly: false,
      unprocessedOnly: false,
      unattachedOnly: true,
      capabilityIds: [],
    });
    expect(out.map((item) => item.id)).toEqual([testId(1)]);
  });

  it("treats whitespace entityId as unattached", () => {
    const out = filterCollectRows(
      [
        row({
          id: testId(70),
          entityId: "   ",
          evidence: evidence({ entityId: "   " }),
        }),
      ],
      {
        q: "",
        states: [],
        hiddenOnly: false,
        unprocessedOnly: false,
        unattachedOnly: true,
        capabilityIds: [],
      }
    );
    expect(out.map((item) => item.id)).toEqual([testId(70)]);
  });

  it("filters unattached unprocessed evidence rows together", () => {
    const out = filterCollectRows(rows, {
      q: "",
      states: [],
      hiddenOnly: false,
      unprocessedOnly: true,
      unattachedOnly: true,
      capabilityIds: [],
    });
    expect(out.map((item) => item.id)).toEqual([testId(1)]);
  });

  it("ignores unprocessed and unattached facets when hiddenOnly is set", () => {
    const hiddenRows = [
      row({
        id: testId(50),
        title: "hidden processed",
        state: "hidden",
        evidence: evidence({
          id: testId(50),
          processedAt: "2026-01-04T00:00:00.000Z",
          deletedAt: "2026-01-05T00:00:00.000Z",
        }),
      }),
      row({
        id: testId(51),
        title: "hidden unprocessed",
        state: "hidden",
        evidence: evidence({
          id: testId(51),
          processedAt: null,
          deletedAt: "2026-01-05T00:00:00.000Z",
        }),
      }),
    ];
    const out = filterCollectRows(hiddenRows, {
      q: "",
      states: [],
      hiddenOnly: true,
      unprocessedOnly: true,
      unattachedOnly: true,
      capabilityIds: [],
    });
    expect(out.map((item) => item.id)).toEqual([testId(50), testId(51)]);
  });

  it("filters by derived state facets", () => {
    const out = filterCollectRows(rows, {
      q: "",
      states: ["running"],
      hiddenOnly: false,
      unprocessedOnly: false,
      unattachedOnly: false,
      capabilityIds: [],
    });
    expect(out.map((item) => item.id)).toEqual([testId(3)]);
  });

  it("filters cancelled job-only rows by cancelled facet", () => {
    const out = filterCollectRows(rows, {
      q: "",
      states: ["cancelled"],
      hiddenOnly: false,
      unprocessedOnly: false,
      unattachedOnly: false,
      capabilityIds: [],
    });
    expect(out.map((item) => item.id)).toEqual([testId(4)]);
  });

  it("filters blocked job-only rows by blocked facet", () => {
    const out = filterCollectRows(rows, {
      q: "",
      states: ["blocked"],
      hiddenOnly: false,
      unprocessedOnly: false,
      unattachedOnly: false,
      capabilityIds: [],
    });
    expect(out.map((item) => item.id)).toEqual([testId(5)]);
  });

  it("filters evidence rows by attached entity display label", () => {
    const entityId = testId(20);
    const out = filterCollectRows(
      rows,
      {
        q: "gamma llc",
        states: [],
        hiddenOnly: false,
        unprocessedOnly: false,
        unattachedOnly: false,
        capabilityIds: [],
      },
      {
        entityLabelById: new Map([[entityId, "Gamma LLC"]]),
      }
    );
    expect(out.map((item) => item.id)).toEqual([testId(2)]);
  });

  it("filters evidence rows by attached entity summary or notes", () => {
    const entityId = testId(21);
    const rowWithEntity = row({
      id: testId(10),
      title: "quiet.txt",
      entityId,
      evidence: evidence({ id: testId(10), label: "quiet.txt" }),
    });
    expect(
      filterCollectRows(
        [rowWithEntity],
        {
          q: "fraud thread",
          states: [],
          hiddenOnly: false,
          unprocessedOnly: false,
          unattachedOnly: false,
          capabilityIds: [],
        },
        {
          entityLabelById: new Map([
            [entityId, "Gamma LLC Shell company tied to the fraud thread"],
          ]),
        }
      ).map((item) => item.id)
    ).toEqual([testId(10)]);
    expect(
      filterCollectRows(
        [rowWithEntity],
        {
          q: "delaware filing",
          states: [],
          hiddenOnly: false,
          unprocessedOnly: false,
          unattachedOnly: false,
          capabilityIds: [],
        },
        {
          entityLabelById: new Map([
            [entityId, "Gamma LLC Registered in Delaware filing"],
          ]),
        }
      ).map((item) => item.id)
    ).toEqual([testId(10)]);
  });

  it("filters job-only rows by referenced evidence notes, URL, and text", () => {
    const evidenceId = testId(30);
    const jobOnly = row({
      id: testId(31),
      title: "Harvest",
      state: "running",
      evidence: null,
      runs: [
        {
          job: job({
            id: testId(32),
            capabilityId: "evidence.harvest",
            input: { evidenceId },
          }),
          role: "process",
        },
      ],
    });
    const evidenceSearchById = new Map([
      [evidenceId, "quiet.txt mailbox tied to the fraud thread"],
    ]);
    expect(
      filterCollectRows(
        [jobOnly],
        {
          q: "fraud thread",
          states: [],
          hiddenOnly: false,
          unprocessedOnly: false,
          unattachedOnly: false,
          capabilityIds: [],
        },
        { evidenceSearchById }
      ).map((item) => item.id)
    ).toEqual([testId(31)]);
    expect(
      filterCollectRows(
        [jobOnly],
        {
          q: "unrelated",
          states: [],
          hiddenOnly: false,
          unprocessedOnly: false,
          unattachedOnly: false,
          capabilityIds: [],
        },
        { evidenceSearchById }
      )
    ).toEqual([]);
  });

  it("filters evidence rows by notes, source URL, and inline text", () => {
    const byNotes = row({
      id: testId(7),
      title: "quiet.txt",
      evidence: evidence({
        id: testId(7),
        label: "quiet.txt",
        notes: "Mailbox tied to the fraud thread",
      }),
    });
    const byUrl = row({
      id: testId(8),
      title: "url ref",
      evidence: evidence({
        id: testId(8),
        label: null,
        sourceUrl: "https://example.com/fraud-thread",
      }),
    });
    const byText = row({
      id: testId(9),
      title: "paste",
      evidence: evidence({
        id: testId(9),
        label: null,
        text: "Paste body mentions the fraud thread",
      }),
    });
    expect(
      filterCollectRows([byNotes], {
        q: "fraud thread",
        states: [],
        hiddenOnly: false,
        unprocessedOnly: false,
        unattachedOnly: false,
        capabilityIds: [],
      }).map((item) => item.id)
    ).toEqual([testId(7)]);
    expect(
      filterCollectRows([byUrl], {
        q: "fraud-thread",
        states: [],
        hiddenOnly: false,
        unprocessedOnly: false,
        unattachedOnly: false,
        capabilityIds: [],
      }).map((item) => item.id)
    ).toEqual([testId(8)]);
    expect(
      filterCollectRows([byText], {
        q: "fraud thread",
        states: [],
        hiddenOnly: false,
        unprocessedOnly: false,
        unattachedOnly: false,
        capabilityIds: [],
      }).map((item) => item.id)
    ).toEqual([testId(9)]);
  });

  it("filters evidence rows by sha256, mime, and kind", () => {
    const bySha = row({
      id: testId(10),
      title: "hash-only",
      evidence: evidence({
        id: testId(10),
        label: null,
        kind: "file",
        mime: "application/pdf",
        sha256:
          "aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899",
        text: null,
      }),
    });
    expect(
      filterCollectRows([bySha], {
        q: "aabbccdd",
        states: [],
        hiddenOnly: false,
        unprocessedOnly: false,
        unattachedOnly: false,
        capabilityIds: [],
      }).map((item) => item.id)
    ).toEqual([testId(10)]);
    expect(
      filterCollectRows([bySha], {
        q: "application/pdf",
        states: [],
        hiddenOnly: false,
        unprocessedOnly: false,
        unattachedOnly: false,
        capabilityIds: [],
      }).map((item) => item.id)
    ).toEqual([testId(10)]);
    expect(
      filterCollectRows([bySha], {
        q: "attestation",
        states: [],
        hiddenOnly: false,
        unprocessedOnly: false,
        unattachedOnly: false,
        capabilityIds: [],
      }).map((item) => item.id)
    ).toEqual([]);
    expect(
      filterCollectRows([bySha], {
        q: "file",
        states: [],
        hiddenOnly: false,
        unprocessedOnly: false,
        unattachedOnly: false,
        capabilityIds: [],
      }).map((item) => item.id)
    ).toEqual([testId(10)]);
  });

  it("filters evidence rows by attached entity slug when name is blank", () => {
    const entityId = testId(21);
    const attached = row({
      id: testId(6),
      title: "attached slug-only",
      state: "landed",
      evidence: evidence({
        id: testId(6),
        entityId,
        processedAt: "2026-01-04T00:00:00.000Z",
      }),
      entityId,
    });
    const out = filterCollectRows(
      [attached],
      {
        q: "slug-only-host",
        states: [],
        hiddenOnly: false,
        unprocessedOnly: false,
        unattachedOnly: false,
        capabilityIds: [],
      },
      {
        entityLabelById: new Map([[entityId, "slug-only-host"]]),
      }
    );
    expect(out.map((item) => item.id)).toEqual([testId(6)]);
  });

  it("filters evidence rows by attached entity slug via slugified query", () => {
    const entityId = testId(22);
    const attached = row({
      id: testId(7),
      title: "attached slug-only",
      state: "landed",
      evidence: evidence({
        id: testId(7),
        entityId,
        processedAt: "2026-01-04T00:00:00.000Z",
      }),
      entityId,
    });
    const out = filterCollectRows(
      [attached],
      {
        q: "Unnamed Host",
        states: [],
        hiddenOnly: false,
        unprocessedOnly: false,
        unattachedOnly: false,
        capabilityIds: [],
      },
      {
        entityLabelById: new Map([[entityId, "Quiet Subject unnamed-host"]]),
      }
    );
    expect(out.map((item) => item.id)).toEqual([testId(7)]);
  });

  it("filters by capability id on attached runs", () => {
    const out = filterCollectRows(rows, {
      q: "",
      states: [],
      hiddenOnly: false,
      unprocessedOnly: false,
      unattachedOnly: false,
      capabilityIds: ["network.dns.lookup"],
    });
    expect(out.map((item) => item.id)).toEqual([testId(3)]);
  });

  it("filters by capability display label on attached runs", () => {
    const out = filterCollectRows(rows, {
      q: "dns lookup",
      states: [],
      hiddenOnly: false,
      unprocessedOnly: false,
      unattachedOnly: false,
      capabilityIds: [],
    });
    expect(out.map((item) => item.id)).toEqual([testId(3)]);
  });

  it("filters by humanized capability id on attached runs", () => {
    const out = filterCollectRows(rows, {
      q: "network shodan",
      states: [],
      hiddenOnly: false,
      unprocessedOnly: false,
      unattachedOnly: false,
      capabilityIds: [],
    });
    expect(out.map((item) => item.id)).toEqual([testId(4)]);
  });

  it("filters by job input subject on attached runs", () => {
    const out = filterCollectRows(rows, {
      q: "example.com",
      states: [],
      hiddenOnly: false,
      unprocessedOnly: false,
      unattachedOnly: false,
      capabilityIds: [],
    });
    expect(out.map((item) => item.id)).toEqual([testId(3)]);
  });

  it("filters process jobs by evidence title from input evidenceId", () => {
    const evidenceId = testId(41);
    const processRow = row({
      id: evidenceId,
      title: "note.txt",
      state: "unprocessed",
      evidence: evidence({ id: evidenceId, label: "note.txt" }),
      runs: [
        {
          job: job({
            id: testId(42),
            capabilityId: "evidence.harvest",
            input: { evidenceId },
          }),
          role: "process",
        },
      ],
    });
    const out = filterCollectRows(
      [processRow],
      {
        q: "note.txt",
        states: [],
        hiddenOnly: false,
        unprocessedOnly: false,
        unattachedOnly: false,
        capabilityIds: [],
      },
      {
        evidenceTitleById: new Map([[evidenceId, "note.txt"]]),
      }
    );
    expect(out.map((item) => item.id)).toEqual([evidenceId]);
  });

  it("filters by playbook id on attached runs", () => {
    const playbookRow = row({
      id: testId(4),
      title: "playbook run",
      state: "running",
      evidence: null,
      runs: [
        {
          job: job({
            id: testId(14),
            capabilityId: "network.dns.lookup",
            playbookId: "host-footprint-lite",
          }),
          role: "collect",
        },
      ],
    });
    const out = filterCollectRows([playbookRow], {
      q: "host-footprint",
      states: [],
      hiddenOnly: false,
      unprocessedOnly: false,
      unattachedOnly: false,
      capabilityIds: [],
    });
    expect(out.map((item) => item.id)).toEqual([testId(4)]);
  });

  it("filters by job error and interpret error on attached runs", () => {
    const failedRow = row({
      id: testId(6),
      title: "failed run",
      state: "failed",
      evidence: null,
      runs: [
        {
          job: job({
            id: testId(16),
            status: "failed",
            error: "Connection timed out",
          }),
          role: "collect",
        },
      ],
    });
    const interpretRow = row({
      id: testId(7),
      title: "interpret failed run",
      state: "failed",
      evidence: null,
      runs: [
        {
          job: job({
            id: testId(17),
            status: "failed",
            interpretError: "proposal payload invalid",
          }),
          role: "collect",
        },
      ],
    });
    expect(
      filterCollectRows([failedRow], {
        q: "timed out",
        states: [],
        hiddenOnly: false,
        unprocessedOnly: false,
        unattachedOnly: false,
        capabilityIds: [],
      }).map((item) => item.id)
    ).toEqual([testId(6)]);
    expect(
      filterCollectRows([interpretRow], {
        q: "payload invalid",
        states: [],
        hiddenOnly: false,
        unprocessedOnly: false,
        unattachedOnly: false,
        capabilityIds: [],
      }).map((item) => item.id)
    ).toEqual([testId(7)]);
  });

  it("filters by job status on attached runs", () => {
    const failedRow = row({
      id: testId(8),
      title: "failed run",
      state: "failed",
      evidence: null,
      runs: [
        {
          job: job({
            id: testId(18),
            status: "failed",
          }),
          role: "collect",
        },
      ],
    });
    expect(
      filterCollectRows([failedRow], {
        q: "failed",
        states: [],
        hiddenOnly: false,
        unprocessedOnly: false,
        unattachedOnly: false,
        capabilityIds: [],
      }).map((item) => item.id)
    ).toEqual([testId(8)]);
  });

  it("filters by collect row state and display label", () => {
    const blockedRow = row({
      id: testId(9),
      title: "blocked harvest",
      state: "blocked",
      evidence: null,
      runs: [],
    });
    expect(
      filterCollectRows([blockedRow], {
        q: "blocked",
        states: [],
        hiddenOnly: false,
        unprocessedOnly: false,
        unattachedOnly: false,
        capabilityIds: [],
      }).map((item) => item.id)
    ).toEqual([testId(9)]);
  });

  it("filters by playbook facet id on attached runs", () => {
    const playbookRow = row({
      id: testId(5),
      title: "playbook run",
      state: "running",
      evidence: null,
      runs: [
        {
          job: job({
            id: testId(15),
            capabilityId: "network.dns.lookup",
            playbookId: "host-footprint-lite",
          }),
          role: "collect",
        },
      ],
    });
    const out = filterCollectRows([playbookRow, ...rows], {
      q: "",
      states: [],
      hiddenOnly: false,
      unprocessedOnly: false,
      unattachedOnly: false,
      capabilityIds: ["host-footprint-lite"],
    });
    expect(out.map((item) => item.id)).toEqual([testId(5)]);
  });
});

describe("resolveCollectSelection", () => {
  const jobRow = row({
    id: testId(60),
    title: "job-only",
    state: "running",
    evidence: null,
    runs: [
      {
        job: job({ id: testId(61) }),
        role: "collect",
      },
      {
        job: job({ id: testId(62), playbookStep: 1 }),
        role: "step",
      },
    ],
  });

  it("focuses a playbook step job id from a padded URL", () => {
    const stepId = testId(62);
    const selection = resolveCollectSelection(
      `  ${stepId}  `,
      (id) => (id === jobRow.id ? jobRow : null),
      [jobRow]
    );
    expect(selection).toEqual({
      rowId: jobRow.id,
      focusRunId: stepId,
    });
  });

  it("holds a missing padded URL id while the row is not indexed yet", () => {
    const pendingId = testId(70);
    const selection = resolveCollectSelection(
      `  ${pendingId}  `,
      () => null,
      [],
      { holdMissingId: true }
    );
    expect(selection).toEqual({
      rowId: pendingId,
      focusRunId: pendingId,
    });
  });
});

describe("applyCollectFilterToggle", () => {
  const base = {
    q: "",
    states: [],
    hiddenOnly: false,
    unprocessedOnly: false,
    unattachedOnly: false,
    capabilityIds: [] as string[],
  };

  it("clears unprocessed and unattached when hiddenOnly is enabled", () => {
    expect(
      applyCollectFilterToggle(
        {
          ...base,
          unprocessedOnly: true,
          unattachedOnly: true,
          states: ["running"],
          capabilityIds: ["network.dns.lookup"],
        },
        "hiddenOnly",
        true
      )
    ).toEqual({
      ...base,
      hiddenOnly: true,
    });
  });

  it("clears hiddenOnly when unprocessed is enabled", () => {
    expect(
      applyCollectFilterToggle(
        { ...base, hiddenOnly: true },
        "unprocessedOnly",
        true
      )
    ).toEqual({
      ...base,
      unprocessedOnly: true,
    });
  });

  it("clears hiddenOnly when unattached is enabled", () => {
    expect(
      applyCollectFilterToggle(
        { ...base, hiddenOnly: true },
        "unattachedOnly",
        true
      )
    ).toEqual({
      ...base,
      unattachedOnly: true,
    });
  });

  it("only clears the toggled facet when disabled", () => {
    expect(
      applyCollectFilterToggle(
        { ...base, hiddenOnly: true },
        "hiddenOnly",
        false
      )
    ).toEqual(base);
  });
});

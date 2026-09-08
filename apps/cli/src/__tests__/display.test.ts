import { describe, expect, it } from "vitest";

import {
  capEgressLabel,
  caseEgressLabel,
  collapseJobListRows,
  enrichCaseDisplay,
  enrichClaimDisplay,
  enrichEdgeDisplay,
  enrichEntityDisplay,
  enrichEvidenceDisplay,
  enrichIdentifierDisplay,
  enrichJobDisplay,
  enrichCancelPlaybookDisplay,
  enrichPlaybookRunDisplay,
  enrichEventDisplay,
  enrichGraphWriteDisplay,
  enrichProposalDisplay,
  enrichQuestionDisplay,
  entityKindLabel,
  evidenceKindLabel,
  confidenceLabel,
  displayStatusLabel,
  identifierTypeLabel,
  jobCapLabel,
  jobInputSubject,
  proposalListSummary,
  edgeDirectionLabel,
  edgePeerLabel,
  evidenceDisplayLabel,
  evidenceTitleMapFromRows,
} from "../display";

describe("display helpers", () => {
  it("enrichJobDisplay adds capLabel, subject, and statusLabel", () => {
    const row = {
      id: "job-1",
      capabilityId: "network.shodan.lookup",
      input: { ip: "1.2.3.4" },
      status: "blocked",
    };
    expect(enrichJobDisplay(row)).toEqual({
      ...row,
      capLabel: "Shodan Lookup",
      subject: "1.2.3.4",
      statusLabel: "Blocked",
    });
  });

  it("jobInputSubject returns empty for missing input", () => {
    expect(jobInputSubject(undefined)).toBe("");
    expect(jobInputSubject(null)).toBe("");
  });

  it("jobInputSubject resolves evidence title from evidenceTitleById", () => {
    const evidenceId = "550e8400-e29b-41d4-a716-446655440000";
    const titles = new Map([[evidenceId, "Vendor Report PDF"]]);
    expect(jobInputSubject({ evidenceId }, titles)).toBe("Vendor Report PDF");
    expect(jobInputSubject({ sourceEvidenceId: evidenceId }, titles)).toBe(
      "Vendor Report PDF"
    );
  });

  it("jobInputSubject resolves entity title from entityTitleById", () => {
    const entityId = "550e8400-e29b-41d4-a716-446655440001";
    const titles = new Map([[entityId, "Acme Corp"]]);
    expect(jobInputSubject({ entityId }, undefined, titles)).toBe("Acme Corp");
  });

  it("evidenceDisplayLabel falls back to URL host and kind label", () => {
    expect(
      evidenceDisplayLabel({
        label: null,
        kind: "url_archive",
        sourceUrl: "https://example.com/page",
      })
    ).toBe("example.com");
    expect(evidenceDisplayLabel({ label: null, kind: "file" })).toBe("File");
  });

  it("evidenceTitleMapFromRows filters to needed ids", () => {
    const map = evidenceTitleMapFromRows(
      [
        {
          id: "ev-1",
          label: "note.txt",
          kind: "file",
          sourceUrl: null,
        },
        {
          id: "ev-2",
          label: "other",
          kind: "file",
          sourceUrl: null,
        },
      ],
      new Set(["ev-1"])
    );
    expect(map.get("ev-1")).toBe("note.txt");
    expect(map.has("ev-2")).toBe(false);
  });

  it("jobCapLabel prefers playbook id for playbook jobs", () => {
    expect(
      jobCapLabel({
        capabilityId: "network.dns.lookup",
        playbookId: "host-footprint-lite",
      })
    ).toBe("Host Footprint Lite");
  });

  it("jobCapLabel returns Playbook for run-id UUID fallbacks", () => {
    expect(
      jobCapLabel({
        capabilityId: "network.dns.lookup",
        playbookId: "00000000-0000-4000-8000-000000000001",
      })
    ).toBe("Playbook");
  });

  it("identifierTypeLabel maps known types", () => {
    expect(identifierTypeLabel("email")).toBe("Email");
    expect(identifierTypeLabel("ip")).toBe("IP");
  });

  it("entityKindLabel and evidenceKindLabel map known kinds", () => {
    expect(entityKindLabel("person")).toBe("Person");
    expect(evidenceKindLabel("url_archive")).toBe("URL Archive");
  });

  it("confidenceLabel and displayStatusLabel map tiers and statuses", () => {
    expect(confidenceLabel("unverified")).toBe("Unverified");
    expect(displayStatusLabel("queued")).toBe("Queued");
    expect(displayStatusLabel("blocked")).toBe("Blocked");
    expect(displayStatusLabel("pending")).toBe("Pending");
  });

  it("capEgressLabel handles boolean and string wire values", () => {
    expect(capEgressLabel(true)).toBe("Third party");
    expect(capEgressLabel("third_party")).toBe("Third party");
    expect(capEgressLabel(false)).toBe("None");
  });

  it("proposalListSummary prefers playbook label over step capability", () => {
    expect(
      proposalListSummary({
        summary: null,
        capabilityId: "network.dns.lookup",
        playbookId: "host-footprint-lite",
      })
    ).toBe("Host Footprint Lite");
  });

  it("proposalListSummary uses patch-linked entity name, not arbitrary map values", () => {
    expect(
      proposalListSummary({
        summary: null,
        capabilityId: "network.shodan.lookup",
        patch: [
          {
            op: "create",
            resource: "claim",
            id: "00000000-0000-4000-8000-000000000002",
            data: {
              entityId: "00000000-0000-4000-8000-000000000001",
              text: "observed",
            },
          },
        ],
        entityNames: {
          "00000000-0000-4000-8000-000000000001": "Alpha Corp",
          "00000000-0000-4000-8000-000000000099": "Wrong Entity",
        },
      })
    ).toBe("Shodan Lookup · Alpha Corp");
  });

  it("proposalListSummary falls back to entity slug when name is blank", () => {
    expect(
      proposalListSummary({
        summary: null,
        capabilityId: "network.shodan.lookup",
        patch: [
          {
            op: "create",
            resource: "claim",
            id: "00000000-0000-4000-8000-000000000002",
            data: {
              entityId: "00000000-0000-4000-8000-000000000001",
              text: "observed",
            },
          },
        ],
        entitySlugs: {
          "00000000-0000-4000-8000-000000000001": "alpha-corp",
        },
      })
    ).toBe("Shodan Lookup · alpha-corp");
  });

  it("edgeDirectionLabel maps inbound and outbound", () => {
    expect(edgeDirectionLabel("out")).toBe("Outbound");
    expect(edgeDirectionLabel("in")).toBe("Inbound");
  });

  it("proposalListSummary falls back to patch op when no summary or cap", () => {
    expect(
      proposalListSummary({
        summary: "",
        capabilityId: null,
        patch: [{ op: "create", resource: "claim", data: {} }],
      })
    ).toBe("Create Claim");
  });

  it("caseEgressLabel describes third-party egress policy", () => {
    expect(caseEgressLabel(true)).toBe("Third party allowed");
    expect(caseEgressLabel(false)).toBe("Third party blocked");
  });

  it("enrichEventDisplay normalizes empty where", () => {
    expect(
      enrichEventDisplay({
        id: "event-1",
        when: "2026-01-01",
        what: "Observed",
        where: null,
      })
    ).toMatchObject({ whereLabel: "—" });
    expect(
      enrichEventDisplay({
        id: "event-2",
        when: "2026-01-01",
        what: "Observed",
        where: "NYC",
      })
    ).toMatchObject({ whereLabel: "NYC" });
  });

  it("enrichCancelPlaybookDisplay adds cancelled count", () => {
    expect(
      enrichCancelPlaybookDisplay({
        playbookRunId: "run-1",
        cancelledJobIds: ["job-1", "job-2"],
      })
    ).toMatchObject({
      cancelledCount: 2,
      statusLabel: "Cancelled",
    });
  });

  it("enrichPlaybookRunDisplay adds playbook label and job labels", () => {
    expect(
      enrichPlaybookRunDisplay({
        playbookId: "host-footprint-lite",
        playbookRunId: "run-1",
        jobs: [
          {
            id: "job-1",
            capabilityId: "network.dns.lookup",
            input: { host: "example.com" },
            status: "queued",
          },
        ],
      })
    ).toMatchObject({
      playbookLabel: "Host Footprint Lite",
      jobs: [
        {
          capLabel: "DNS Lookup",
          subject: "example.com",
        },
      ],
    });
  });

  it("enrichGraphWriteDisplay adds confidence and patch summary", () => {
    expect(
      enrichGraphWriteDisplay(
        {
          writeId: "00000000-0000-4000-8000-000000000001",
          confidence: "unverified",
          opCount: 1,
          replayed: false,
          actorLabel: "test",
        },
        [
          {
            op: "create",
            resource: "claim",
            id: "00000000-0000-4000-8000-000000000002",
            data: { text: "x" },
          },
        ]
      )
    ).toMatchObject({
      confidenceLabel: "Unverified",
      patchSummary: "Create Claim",
    });
  });

  it("enrichCaseDisplay adds egressLabel", () => {
    expect(
      enrichCaseDisplay({
        id: "case-1",
        name: "Alpha",
        slug: "alpha",
        allowThirdPartyEgress: false,
      })
    ).toMatchObject({
      egressLabel: "Third party blocked",
    });
  });

  it("enrich helpers add human labels for mutation output", () => {
    expect(
      enrichEntityDisplay({ id: "e1", kind: "person", name: "A" })
    ).toMatchObject({
      kindLabel: "Person",
    });
    expect(enrichEvidenceDisplay({ id: "ev1", kind: "file" })).toMatchObject({
      kindLabel: "File",
    });
    expect(
      enrichIdentifierDisplay({
        id: "i1",
        type: "email",
        value: "a@b.c",
        confidence: "unverified",
        status: "current",
      })
    ).toMatchObject({
      typeLabel: "Email",
      confidenceLabel: "Unverified",
      statusLabel: "Current",
    });
    expect(
      enrichClaimDisplay({
        id: "c1",
        confidence: "possible",
        class: "observation",
        text: "x",
      })
    ).toMatchObject({
      confidenceLabel: "Possible",
      classLabel: "Observation",
    });
    expect(
      enrichQuestionDisplay({ id: "q1", status: "open", text: "?" })
    ).toMatchObject({
      statusLabel: "Open",
    });
    expect(
      enrichProposalDisplay({
        id: "p1",
        status: "pending",
        summary: null,
        capabilityId: "network.dns.lookup",
        patch: [],
      })
    ).toMatchObject({
      statusLabel: "Pending",
      summaryLabel: "DNS Lookup",
      sourceLabel: "DNS Lookup",
    });
    expect(
      enrichEdgeDisplay({
        id: "edge-1",
        peerName: "Peer",
        peerSlug: "peer",
        predicate: "related_to",
        direction: "out",
        confidence: "unverified",
      })
    ).toMatchObject({
      peer: "Peer",
      dirLabel: "Outbound",
      confidenceLabel: "Unverified",
    });
  });

  it("edgePeerLabel falls back to slug when peer name is blank", () => {
    expect(edgePeerLabel({ peerName: "  ", peerSlug: "acme-corp" })).toBe(
      "acme-corp"
    );
    expect(edgePeerLabel({ peerName: "", peerSlug: "" })).toBe("—");
  });
});

describe("collapseJobListRows", () => {
  it("keeps solo jobs and collapses playbook steps into one row per run", () => {
    const runId = "00000000-0000-4000-8000-000000000014";
    const rows = collapseJobListRows([
      {
        id: "job-solo",
        capabilityId: "network.dns.lookup",
        status: "queued",
        resultSummary: null,
        input: { host: "solo.test" },
        createdAt: "2026-01-03T00:00:00.000Z",
      },
      {
        id: "job-step-0",
        capabilityId: "network.dns.lookup",
        status: "succeeded",
        resultSummary: "dns ok",
        input: { host: "example.com" },
        playbookId: "host-footprint-lite",
        playbookRunId: runId,
        playbookStep: 0,
        createdAt: "2026-01-03T00:01:00.000Z",
        updatedAt: "2026-01-03T00:01:00.000Z",
      },
      {
        id: "job-step-1",
        capabilityId: "network.shodan.lookup",
        status: "running",
        resultSummary: null,
        input: { ip: "198.51.100.42" },
        playbookId: "host-footprint-lite",
        playbookRunId: runId,
        playbookStep: 1,
        createdAt: "2026-01-03T00:02:00.000Z",
        updatedAt: "2026-01-03T00:02:00.000Z",
      },
    ]);

    expect(rows).toHaveLength(2);
    const collapsed = rows.find((row) => row.id === runId);
    expect(collapsed?.status).toBe("running");
    expect(collapsed?.resultSummary).toBe("dns ok");
    expect(collapsed?.playbookId).toBe("host-footprint-lite");
    expect(collapsed?.input).toEqual({ host: "example.com" });
  });

  it("prefers blocked over queued when a later step is only queued", () => {
    const runId = "00000000-0000-4000-8000-000000000015";
    const rows = collapseJobListRows([
      {
        id: "job-step-0",
        capabilityId: "network.dns.lookup",
        status: "blocked",
        resultSummary: "rate limited",
        input: { host: "example.com" },
        playbookId: "host-footprint-lite",
        playbookRunId: runId,
        playbookStep: 0,
        createdAt: "2026-01-03T00:01:00.000Z",
        updatedAt: "2026-01-03T00:01:00.000Z",
      },
      {
        id: "job-step-1",
        capabilityId: "network.shodan.lookup",
        status: "queued",
        resultSummary: null,
        input: { ip: "198.51.100.42" },
        playbookId: "host-footprint-lite",
        playbookRunId: runId,
        playbookStep: 1,
        createdAt: "2026-01-03T00:02:00.000Z",
        updatedAt: "2026-01-03T00:02:00.000Z",
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("blocked");
  });

  it("groups playbook steps when run id is padded with whitespace", () => {
    const runId = "00000000-0000-4000-8000-000000000016";
    const rows = collapseJobListRows([
      {
        id: "job-step-0",
        capabilityId: "network.dns.lookup",
        status: "succeeded",
        resultSummary: "dns ok",
        input: { host: "example.com" },
        playbookId: "host-footprint-lite",
        playbookRunId: `  ${runId}  `,
        playbookStep: 0,
        createdAt: "2026-01-03T00:01:00.000Z",
        updatedAt: "2026-01-03T00:01:00.000Z",
      },
      {
        id: "job-step-1",
        capabilityId: "network.shodan.lookup",
        status: "queued",
        resultSummary: null,
        input: { ip: "198.51.100.42" },
        playbookId: "host-footprint-lite",
        playbookRunId: runId,
        playbookStep: 1,
        createdAt: "2026-01-03T00:02:00.000Z",
        updatedAt: "2026-01-03T00:02:00.000Z",
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(runId);
    expect(rows[0]?.status).toBe("queued");
  });
});

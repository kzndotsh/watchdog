import { describe, expect, it } from "vitest";

import {
  e2eApiParsers,
  parseCaseList,
  parseEntity,
  parseEvidenceList,
  parseJobList,
  parseProposalList,
} from "./parsers";

describe("e2e api parsers", () => {
  it("parseCaseList accepts valid rows", () => {
    expect(
      parseCaseList({
        items: [{ id: "a", name: "Case A", slug: "case-a" }],
        nextCursor: null,
      })
    ).toEqual({
      items: [{ id: "a", name: "Case A", slug: "case-a" }],
      nextCursor: null,
    });
  });

  it("parseCaseList rejects malformed rows", () => {
    expect(() =>
      parseCaseList({ items: [{ id: "a", name: "Case A" }], nextCursor: null })
    ).toThrow("cases[0] missing id/name/slug");
  });

  it("a list parser refuses a bare array and keeps the next cursor", () => {
    expect(() => parseCaseList([])).toThrow("cases response was not a page");
    expect(parseCaseList({ items: [], nextCursor: "next" }).nextCursor).toBe(
      "next"
    );
    expect(() => parseCaseList({ items: [], nextCursor: 3 })).toThrow(
      "cases page has no nextCursor"
    );
  });

  it("parseEntity requires id, name, and slug", () => {
    expect(parseEntity({ id: "e1", name: "Ada", slug: "ada" })).toEqual({
      id: "e1",
      name: "Ada",
      slug: "ada",
    });
    expect(() => parseEntity({ id: "e1", name: "Ada" })).toThrow(
      "entity response missing id/name/slug"
    );
  });

  it("parseEvidenceList requires id on each row", () => {
    expect(
      parseEvidenceList({ items: [{ id: "ev1" }], nextCursor: null }).items
    ).toEqual([{ id: "ev1" }]);
    expect(() => parseEvidenceList({ items: [{}], nextCursor: null })).toThrow(
      "evidence[0] missing id"
    );
  });

  it("parseProposalList requires id and status on each row", () => {
    expect(
      parseProposalList({
        items: [{ id: "p1", status: "pending" }],
        nextCursor: null,
      }).items
    ).toEqual([{ id: "p1", status: "pending" }]);
    expect(() =>
      parseProposalList({ items: [{ id: "p1" }], nextCursor: null })
    ).toThrow("proposals[0] missing id/status");
  });

  it("parseJobList keeps id, capability, status and both error fields", () => {
    expect(
      parseJobList({
        items: [
          {
            id: "j1",
            capabilityId: "evidence.harvest",
            status: "failed",
            error: "pg-boss failed",
            interpretError: null,
          },
        ],
        nextCursor: null,
      }).items
    ).toEqual([
      {
        id: "j1",
        capabilityId: "evidence.harvest",
        status: "failed",
        error: "pg-boss failed",
        interpretError: null,
      },
    ]);
    expect(() =>
      parseJobList({
        items: [{ id: "j1", status: "queued" }],
        nextCursor: null,
      })
    ).toThrow("jobs[0] missing id/capabilityId/status");
  });

  it("e2eApiParsers exposes all parsers", () => {
    expect(e2eApiParsers.caseList).toBe(parseCaseList);
    expect(e2eApiParsers.evidenceList).toBe(parseEvidenceList);
    expect(e2eApiParsers.proposalList).toBe(parseProposalList);
    expect(e2eApiParsers.jobList).toBe(parseJobList);
  });
});

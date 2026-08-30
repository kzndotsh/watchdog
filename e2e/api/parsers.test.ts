import { describe, expect, it } from "vitest";

import {
  e2eApiParsers,
  parseCaseList,
  parseEntity,
  parseEvidenceList,
  parseProposalList,
} from "./parsers";

describe("e2e api parsers", () => {
  it("parseCaseList accepts valid rows", () => {
    expect(parseCaseList([{ id: "a", name: "Case A" }])).toEqual([
      { id: "a", name: "Case A" },
    ]);
  });

  it("parseCaseList rejects malformed rows", () => {
    expect(() => parseCaseList([{ id: "a" }])).toThrow(
      "cases[0] missing id/name"
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
    expect(parseEvidenceList([{ id: "ev1" }])).toEqual([{ id: "ev1" }]);
    expect(() => parseEvidenceList([{}])).toThrow("evidence[0] missing id");
  });

  it("parseProposalList requires id and status on each row", () => {
    expect(parseProposalList([{ id: "p1", status: "pending" }])).toEqual([
      { id: "p1", status: "pending" },
    ]);
    expect(() => parseProposalList([{ id: "p1" }])).toThrow(
      "proposals[0] missing id/status"
    );
  });

  it("e2eApiParsers exposes all parsers", () => {
    expect(e2eApiParsers.caseList).toBe(parseCaseList);
    expect(e2eApiParsers.evidenceList).toBe(parseEvidenceList);
    expect(e2eApiParsers.proposalList).toBe(parseProposalList);
  });
});

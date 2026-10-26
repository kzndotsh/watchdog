import { beforeEach, describe, expect, it, vi } from "vitest";

import { testCaseId } from "@watchdog/schemas/testing";

const getEvidence = vi.fn();

vi.mock("../client", () => ({
  api: () => ({
    evidence: {
      getMany: getEvidence,
    },
  }),
}));

import { evidenceTitlesForJobs } from "../job-evidence-titles";

describe("evidenceTitlesForJobs", () => {
  const caseId = testCaseId(1);

  beforeEach(() => {
    getEvidence.mockReset();
  });

  it("reads the referenced Evidence by id, hidden rows included, in one request", async () => {
    const hiddenId = "550e8400-e29b-41d4-a716-446655440099";
    const activeId = "550e8400-e29b-41d4-a716-446655440010";
    getEvidence.mockResolvedValue([
      { id: hiddenId, label: "Hidden dump", kind: "file", sourceUrl: null },
      { id: activeId, label: "Active note", kind: "note", sourceUrl: null },
    ]);

    const titles = await evidenceTitlesForJobs(caseId, [
      { input: { evidenceId: hiddenId } },
      { input: { sourceEvidenceId: activeId } },
    ]);

    expect(getEvidence).toHaveBeenCalledTimes(1);
    expect(getEvidence).toHaveBeenCalledWith({
      caseId,
      ids: [hiddenId, activeId],
    });
    expect(titles.get(hiddenId)).toBe("Hidden dump");
    expect(titles.get(activeId)).toBe("Active note");
  });

  it("returns an empty map when jobs reference no evidence ids", async () => {
    const titles = await evidenceTitlesForJobs(caseId, [
      { input: { host: "example.com" } },
    ]);
    expect(titles.size).toBe(0);
    expect(getEvidence).not.toHaveBeenCalled();
  });
});

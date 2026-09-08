import { beforeEach, describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

const listEvidence = vi.fn();

vi.mock("../client", () => ({
  api: () => ({
    evidence: {
      list: listEvidence,
    },
  }),
}));

import { evidenceTitlesForJobs } from "../job-evidence-titles";

describe("evidenceTitlesForJobs", () => {
  const caseId = testId(1);

  beforeEach(() => {
    listEvidence.mockReset();
  });

  it("merges active and hidden evidence lists for job input titles", async () => {
    const hiddenId = "550e8400-e29b-41d4-a716-446655440099";
    listEvidence.mockImplementation(async (input: { hiddenOnly?: boolean }) => {
      if (input.hiddenOnly === true) {
        return [
          {
            id: hiddenId,
            label: "Hidden dump",
            kind: "file",
            sourceUrl: null,
          },
        ];
      }
      return [];
    });

    const titles = await evidenceTitlesForJobs(caseId, [
      { input: { evidenceId: hiddenId } },
    ]);

    expect(listEvidence).toHaveBeenCalledTimes(2);
    expect(titles.get(hiddenId)).toBe("Hidden dump");
  });

  it("skips hidden evidence list when active rows satisfy job references", async () => {
    const activeId = "550e8400-e29b-41d4-a716-446655440010";
    listEvidence.mockResolvedValue([
      {
        id: activeId,
        label: "Active note",
        kind: "note",
        sourceUrl: null,
      },
    ]);

    const titles = await evidenceTitlesForJobs(caseId, [
      { input: { evidenceId: activeId } },
    ]);

    expect(listEvidence).toHaveBeenCalledTimes(1);
    expect(listEvidence).toHaveBeenCalledWith({
      caseId,
      unprocessedOnly: false,
      unattachedOnly: false,
      hiddenOnly: false,
    });
    expect(titles.get(activeId)).toBe("Active note");
  });

  it("returns an empty map when jobs reference no evidence ids", async () => {
    const titles = await evidenceTitlesForJobs(caseId, [
      { input: { host: "example.com" } },
    ]);
    expect(titles.size).toBe(0);
    expect(listEvidence).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from "vitest";

import { testCaseId } from "@watchdog/schemas/testing";

import { evidenceTitlesForJobs } from "../job-evidence-titles";
import { queryIds, standInApi } from "./stand-in-api";

// A developer `.env` above the checkout would otherwise be loaded into process.env.
vi.mock("dotenv", () => ({ config: vi.fn() }));

const standIn = standInApi();

describe("evidenceTitlesForJobs", () => {
  const caseId = testCaseId(1);

  it("reads the referenced Evidence by id, hidden rows included, in one request", async () => {
    const hiddenId = "550e8400-e29b-41d4-a716-446655440099";
    const activeId = "550e8400-e29b-41d4-a716-446655440010";
    standIn.json("get", `/cases/${caseId}/evidence/by-ids`, [
      { id: hiddenId, label: "Hidden dump", kind: "file", sourceUrl: null },
      { id: activeId, label: "Active note", kind: "note", sourceUrl: null },
    ]);

    const titles = await evidenceTitlesForJobs(caseId, [
      { input: { evidenceId: hiddenId } },
      { input: { sourceEvidenceId: activeId } },
    ]);

    expect(standIn.seen.map((r) => queryIds(r.url))).toEqual([
      [hiddenId, activeId],
    ]);
    expect(titles.get(hiddenId)).toBe("Hidden dump");
    expect(titles.get(activeId)).toBe("Active note");
  });

  it("returns an empty map and sends no request when jobs reference no evidence ids", async () => {
    const titles = await evidenceTitlesForJobs(caseId, [
      { input: { host: "example.com" } },
    ]);
    expect(titles.size).toBe(0);
    expect(standIn.seen).toEqual([]);
  });
});

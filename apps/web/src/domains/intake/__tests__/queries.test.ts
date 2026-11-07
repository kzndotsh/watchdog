import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

const reads = vi.hoisted(() => ({
  getEvidenceDownloadUrlFn: vi.fn(),
  listEvidencePageFn: vi.fn(),
  listEvidencePickerPageFn: vi.fn(),
  getEvidenceManyFn: vi.fn(),
}));

vi.mock("@/domains/intake/intake.functions", () => reads);

import {
  evidenceDownloadUrlQuery,
  evidencePickerPort,
  urlDumpsQuery,
} from "@/domains/intake/queries";

describe("intake queries", () => {
  it("reads a download URL and the URL dumps only with the ids they need", () => {
    expect(urlDumpsQuery("case-1", true).enabled).toBe(false);
    expect(evidenceDownloadUrlQuery("case-1", "").enabled).toBe(false);
    const caseId = testId(10);
    const evidenceId = testId(20);
    expect(evidenceDownloadUrlQuery(caseId, evidenceId).enabled).toBe(true);
  });

  it("keys a padded Case and Evidence id like the trimmed ones", () => {
    const caseId = testId(10);
    const evidenceId = testId(20);

    expect(
      evidenceDownloadUrlQuery(`  ${caseId}  `, `  ${evidenceId}  `).queryKey
    ).toEqual(evidenceDownloadUrlQuery(caseId, evidenceId).queryKey);
  });

  it("reads the Evidence picker's page through the slim projection, never the record list", async () => {
    const caseId = testId(10);
    reads.listEvidencePickerPageFn.mockResolvedValue({
      items: [
        {
          id: testId(20),
          kind: "paste",
          label: "Note",
          sourceUrl: null,
          sha256: null,
          capturedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      nextCursor: null,
      total: null,
    });
    const port = evidencePickerPort(caseId);

    const recent = port.search(null);
    expect(port.search("memo").queryKey).not.toEqual(recent.queryKey);
    const options = await new QueryClient().query(recent);
    expect(options).toEqual([
      {
        id: testId(20),
        kind: "paste",
        label: "Note",
        sourceUrl: null,
        sha256: null,
      },
    ]);
    expect(reads.listEvidencePickerPageFn).toHaveBeenCalledWith({
      data: { caseId, limit: 20 },
    });

    await new QueryClient().query(port.search("memo"));
    expect(reads.listEvidencePickerPageFn).toHaveBeenLastCalledWith({
      data: { caseId, limit: 20, q: "memo" },
    });
    expect(reads.listEvidencePageFn).not.toHaveBeenCalled();
  });
});

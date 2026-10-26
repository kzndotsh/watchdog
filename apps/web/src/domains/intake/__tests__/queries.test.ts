import { describe, expect, it, vi } from "vitest";

import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";
import { testId } from "@watchdog/test-kit";

const reads = vi.hoisted(() => ({
  getEvidenceDownloadUrlFn: vi.fn(),
  listEvidenceFn: vi.fn(),
  listEvidencePageFn: vi.fn(),
  listEvidencePickerPageFn: vi.fn(),
  getEvidenceManyFn: vi.fn(),
}));

vi.mock("@/domains/intake/intake.functions", () => reads);

import {
  evidenceDownloadUrlQuery,
  evidenceKeys,
  evidenceListQuery,
  evidencePickerPort,
} from "@/domains/intake/queries";

describe("intake queries", () => {
  it("builds evidence list and download keys", () => {
    expect(evidenceKeys.all("case-1")).toEqual(["evidence", "case-1"]);
    expect(evidenceKeys.list("case-1")).toEqual([
      "evidence",
      "case-1",
      "list",
      "active",
    ]);
    expect(evidenceKeys.list("case-1", true)).toEqual([
      "evidence",
      "case-1",
      "list",
      "hidden",
    ]);
    expect(evidenceKeys.download("case-1", "ev-1")).toEqual([
      "evidence",
      "case-1",
      "download",
      "ev-1",
    ]);
  });

  it("normalizes padded case ids for list query keys", () => {
    const caseId = testId(10);
    expect(evidenceListQuery(`  ${caseId}  `).queryKey).toEqual(
      evidenceKeys.list(caseId)
    );
  });

  it("uses default stale tiers and gates download by evidence id", () => {
    expect(evidenceListQuery("case-1")).toMatchObject({
      queryKey: evidenceKeys.list("case-1"),
      enabled: false,
      staleTime: STALE_DEFAULT,
      gcTime: GC_DEFAULT,
    });
    expect(evidenceDownloadUrlQuery("case-1", "")).toMatchObject({
      enabled: false,
    });
    const caseId = testId(10);
    const evidenceId = testId(20);
    expect(evidenceDownloadUrlQuery(caseId, evidenceId)).toMatchObject({
      enabled: true,
      queryKey: evidenceKeys.download(caseId, evidenceId),
    });
    expect(
      evidenceDownloadUrlQuery(`  ${caseId}  `, `  ${evidenceId}  `).queryKey
    ).toEqual(evidenceKeys.download(caseId, evidenceId));
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
    expect(recent.queryKey).toEqual([
      ...evidenceKeys.all(caseId),
      "picker",
      "",
    ]);
    const options = await (recent.queryFn as () => Promise<unknown>)();
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

    await (port.search("memo").queryFn as () => Promise<unknown>)();
    expect(reads.listEvidencePickerPageFn).toHaveBeenLastCalledWith({
      data: { caseId, limit: 20, q: "memo" },
    });
    expect(reads.listEvidencePageFn).not.toHaveBeenCalled();
  });
});

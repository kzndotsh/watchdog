import { ORPCError } from "@orpc/client";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/orpc-client", async () =>
  (await import("@/testing/orpc-client")).orpcClientModuleDouble()
);

import {
  evidenceByIdQuery,
  evidenceDownloadUrlQuery,
  evidencePickerPort,
  urlDumpsQuery,
} from "@/domains/intake/queries";
import { procedureDouble } from "@/testing/orpc-client";
import { buildEvidenceRecord } from "@/testing/records";
import { testId } from "@watchdog/domain/test-kit";

const listEvidence = procedureDouble("evidence.list");
const pickerPage = procedureDouble("evidence.pickerPage");
const getEvidence = procedureDouble("evidence.get");

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

  it("answers null for an Evidence item the Case no longer holds, and rethrows anything else", async () => {
    const caseId = testId(10);
    const evidenceId = testId(20);
    getEvidence.mockRejectedValueOnce(new ORPCError("NOT_FOUND"));
    await expect(
      new QueryClient().query(evidenceByIdQuery(caseId, evidenceId))
    ).resolves.toBeNull();
    expect(getEvidence).toHaveBeenLastCalledWith({ caseId, evidenceId });

    getEvidence.mockRejectedValueOnce(new ORPCError("INTERNAL_SERVER_ERROR"));
    await expect(
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }).query(evidenceByIdQuery(caseId, evidenceId))
    ).rejects.toBeInstanceOf(ORPCError);

    const row = buildEvidenceRecord({ id: evidenceId });
    getEvidence.mockResolvedValueOnce(row);
    await expect(
      new QueryClient().query(evidenceByIdQuery(caseId, evidenceId))
    ).resolves.toBe(row);
  });

  it("reads the Evidence picker's page through the slim projection, never the record list", async () => {
    const caseId = testId(10);
    pickerPage.mockResolvedValue({
      items: [
        {
          id: testId(20),
          kind: "attestation",
          label: "Note",
          sourceUrl: null,
          sha256: null,
          capturedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      nextCursor: null,
      total: null,
    });
    const port = evidencePickerPort(` ${caseId} `);

    const recent = port.search(null);
    expect(port.search("memo").queryKey).not.toEqual(recent.queryKey);
    const options = await new QueryClient().query(recent);
    expect(options).toEqual([
      {
        id: testId(20),
        kind: "attestation",
        label: "Note",
        sourceUrl: null,
        sha256: null,
      },
    ]);
    expect(pickerPage).toHaveBeenCalledWith({ caseId, limit: 20 });

    await new QueryClient().query(port.search("memo"));
    expect(pickerPage).toHaveBeenLastCalledWith({
      caseId,
      limit: 20,
      q: "memo",
    });
    expect(listEvidence).not.toHaveBeenCalled();
  });
});

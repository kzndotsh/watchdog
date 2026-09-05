import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { EvidenceRecord } from "@/domains/intake/types";
import { testId, testHttpUrl } from "@watchdog/test-kit";

vi.mock("@/auth/server", () => ({
  auth: {},
}));

const useQueryMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: (...args: unknown[]) => useQueryMock(...args),
  };
});

import { useEvidenceBlob } from "@/domains/intake/hooks/use-evidence-blob";

function evidence(overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    id: testId(40),
    caseId: testId(10),
    entityId: null,
    kind: "attestation",
    label: "note",
    notes: null,
    mime: "text/plain",
    uri: null,
    sha256: null,
    text: "inline body",
    sourceUrl: null,
    actorId: "test-actor",
    actorLabel: "test-actor",
    capturedAt: "2026-01-01T00:00:00.000Z",
    processedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

describe("useEvidenceBlob", () => {
  it("returns inline text without fetching blob content", () => {
    useQueryMock.mockReturnValue({ data: undefined, isPending: false });

    const { result } = renderHook(() =>
      useEvidenceBlob(testId(10), evidence())
    );

    expect(result.current.resolvedText).toBe("inline body");
    expect(result.current.loadingBlob).toBe(false);
    expect(result.current.hasUri).toBe(false);
  });

  it("loads blob text when evidence stores only a URI", () => {
    useQueryMock.mockImplementation((options: { queryKey?: unknown[] }) => {
      const key = options.queryKey ?? [];
      if (key[0] === "artifact" && key[1] === "evidence") {
        return { data: { text: "fetched body" }, isPending: false };
      }
      if (key[0] === "evidence" && key[2] === "download") {
        return {
          data: { url: testHttpUrl("download.test/blob") },
          isPending: false,
        };
      }
      return { data: undefined, isPending: false };
    });

    const { result } = renderHook(() =>
      useEvidenceBlob(
        testId(10),
        evidence({ text: null, uri: "s3://bucket/key", mime: "text/plain" })
      )
    );

    expect(result.current.resolvedText).toBe("fetched body");
    expect(result.current.downloadUrl).toBe(testHttpUrl("download.test/blob"));
    expect(result.current.hasUri).toBe(true);
  });
});

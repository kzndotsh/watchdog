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
import { evidenceNeedsBlobText } from "@/domains/intake/hooks/use-evidence-blob.queries";

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
    useQueryMock.mockReturnValue({
      data: undefined,
      isFetched: true,
      isLoading: false,
      isError: false,
    });

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
        return {
          data: { text: "fetched body" },
          isFetched: true,
          isLoading: false,
          isError: false,
        };
      }
      if (key[0] === "evidence" && key[2] === "download") {
        return {
          data: { url: testHttpUrl("download.test/blob") },
          isFetched: true,
          isLoading: false,
          isError: false,
        };
      }
      return {
        data: undefined,
        isFetched: true,
        isLoading: false,
        isError: false,
      };
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

  it("loads blob text for attestation evidence stored only in object storage", () => {
    useQueryMock.mockImplementation((options: { queryKey?: unknown[] }) => {
      const key = options.queryKey ?? [];
      if (key[0] === "artifact" && key[1] === "evidence") {
        return {
          data: { text: "attestation body" },
          isFetched: true,
          isLoading: false,
          isError: false,
        };
      }
      if (key[0] === "evidence" && key[2] === "download") {
        return {
          data: { url: null },
          isFetched: true,
          isLoading: false,
          isError: false,
        };
      }
      return {
        data: undefined,
        isFetched: true,
        isLoading: false,
        isError: false,
      };
    });

    const row = evidence({
      kind: "attestation",
      text: null,
      uri: "s3://bucket/attestation.md",
      mime: null,
    });
    expect(evidenceNeedsBlobText(row)).toBe(true);

    const { result } = renderHook(() => useEvidenceBlob(testId(10), row));

    expect(result.current.resolvedText).toBe("attestation body");
  });

  it("surfaces contentLoadError when blob fetch fails", () => {
    useQueryMock.mockImplementation((options: { queryKey?: unknown[] }) => {
      const key = options.queryKey ?? [];
      if (key[0] === "artifact" && key[1] === "evidence") {
        return {
          data: undefined,
          isFetched: true,
          isLoading: false,
          isError: true,
          error: new Error("blob unavailable"),
          refetch: vi.fn(),
        };
      }
      if (key[0] === "evidence" && key[2] === "download") {
        return {
          data: { url: null },
          isFetched: true,
          isLoading: false,
          isError: false,
          refetch: vi.fn(),
        };
      }
      return {
        data: undefined,
        isFetched: true,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      };
    });

    const row = evidence({
      text: null,
      uri: "s3://bucket/key",
      mime: "text/plain",
    });
    const { result } = renderHook(() => useEvidenceBlob(testId(10), row));

    expect(result.current.contentLoadError).toBe("blob unavailable");
  });

  it("defers contentLoadError while the sibling query is still pending", () => {
    useQueryMock.mockImplementation((options: { queryKey?: unknown[] }) => {
      const key = options.queryKey ?? [];
      if (key[0] === "artifact" && key[1] === "evidence") {
        return {
          data: undefined,
          isFetched: false,
          isLoading: true,
          isError: false,
          refetch: vi.fn(),
        };
      }
      if (key[0] === "evidence" && key[2] === "download") {
        return {
          data: undefined,
          isFetched: true,
          isLoading: false,
          isError: true,
          error: new Error("download unavailable"),
          refetch: vi.fn(),
        };
      }
      return {
        data: undefined,
        isFetched: true,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      };
    });

    const row = evidence({
      text: null,
      uri: "s3://bucket/key",
      mime: "text/plain",
    });
    const { result } = renderHook(() => useEvidenceBlob(testId(10), row));

    expect(result.current.loadingBlob).toBe(true);
    expect(result.current.contentLoadError).toBeNull();
  });

  it("does not fetch blob or download when case id is not a graph uuid", () => {
    useQueryMock.mockImplementation(
      (options: { queryKey?: unknown[]; enabled?: boolean }) => ({
        data: undefined,
        isFetched: true,
        isLoading: false,
        isError: false,
        enabled: options.enabled,
      })
    );

    const callsBefore = useQueryMock.mock.calls.length;
    renderHook(() =>
      useEvidenceBlob(
        "case-1",
        evidence({ text: null, uri: "s3://bucket/key", mime: "text/plain" })
      )
    );

    const newCalls = useQueryMock.mock.calls.slice(callsBefore);
    expect(newCalls).toHaveLength(2);
    for (const call of newCalls) {
      expect(call[0]?.enabled).toBe(false);
    }
  });
});

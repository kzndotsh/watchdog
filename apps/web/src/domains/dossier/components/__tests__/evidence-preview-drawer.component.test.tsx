import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { testId, testHttpUrl } from "@watchdog/test-kit";

const useQueryMock = vi.hoisted(() => vi.fn());

vi.mock("@/auth/server", () => ({
  auth: {},
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: (...args: unknown[]) => useQueryMock(...args),
  };
});

import { EvidencePreviewDrawer } from "@/domains/dossier/components/evidence-preview-drawer";
import type { EvidenceRecord } from "@/domains/intake/types";

function fetchedQuery<T>(data: T) {
  return {
    data,
    isFetched: true,
    isLoading: false,
    isError: false,
  };
}

const EVIDENCE: EvidenceRecord = {
  id: testId(40),
  caseId: testId(10),
  entityId: null,
  kind: "attestation",
  label: "Screenshot note",
  notes: "Captured from inbox",
  mime: "text/plain",
  uri: null,
  sha256: null,
  text: "Body text",
  sourceUrl: null,
  actorId: "actor-1",
  actorLabel: "actor-1",
  capturedAt: "2026-01-01T00:00:00.000Z",
  processedAt: null,
  deletedAt: null,
};

describe("EvidencePreviewDrawer", () => {
  it("renders evidence metadata when open", () => {
    useQueryMock.mockReturnValue(fetchedQuery({ url: null }));
    render(
      <EvidencePreviewDrawer
        evidence={EVIDENCE}
        caseId={testId(10)}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("Screenshot note")).toBeInTheDocument();
    expect(screen.getByText("Body text")).toBeInTheDocument();
    expect(screen.getByText("Captured from inbox")).toBeInTheDocument();
  });

  it("renders JSON file evidence text content", () => {
    useQueryMock.mockReturnValue(fetchedQuery({ url: null }));
    render(
      <EvidencePreviewDrawer
        evidence={{
          ...EVIDENCE,
          kind: "file",
          label: "API dump",
          mime: "application/json",
          text: '{"status":"ok"}',
          notes: null,
        }}
        caseId={testId(10)}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('{"status":"ok"}')).toBeInTheDocument();
  });

  it("fetches URI-backed JSON text when inline body is empty", () => {
    useQueryMock.mockImplementation((options: { queryKey?: unknown[] }) => {
      const key = options.queryKey ?? [];
      if (key[0] === "artifact" && key[1] === "evidence") {
        return fetchedQuery({ text: '{"status":"ok"}' });
      }
      if (key[0] === "evidence" && key[2] === "download") {
        return fetchedQuery({ url: testHttpUrl("download.test/blob.json") });
      }
      return fetchedQuery(undefined);
    });

    render(
      <EvidencePreviewDrawer
        evidence={{
          ...EVIDENCE,
          kind: "file",
          label: "API dump",
          mime: "application/json",
          uri: "s3://bucket/key.json",
          sha256: "abc",
          text: null,
          notes: null,
        }}
        caseId={testId(10)}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('{"status":"ok"}')).toBeInTheDocument();
  });

  it("uses evidencePrimaryLabel for URL-only evidence titles", () => {
    useQueryMock.mockReturnValue(fetchedQuery({ url: null }));
    render(
      <EvidencePreviewDrawer
        evidence={{
          ...EVIDENCE,
          label: null,
          sourceUrl: testHttpUrl("cdn.example.com/report.json"),
          text: null,
          notes: null,
        }}
        caseId={testId(10)}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("cdn.example.com")).toBeInTheDocument();
  });
});

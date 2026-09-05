import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

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
    useQueryMock.mockReturnValue({ data: { url: null }, isPending: false });
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
});

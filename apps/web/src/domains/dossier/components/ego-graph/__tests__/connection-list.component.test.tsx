import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { EdgeRecord } from "@/domains/entities/edges/types";
import { testId } from "@watchdog/test-kit";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: () => vi.fn(),
}));

import { CompactConnectionList } from "@/domains/dossier/components/ego-graph/connection-list";

function edge(overrides: Partial<EdgeRecord> = {}): EdgeRecord {
  return {
    id: testId(10),
    fromId: testId(1),
    toId: testId(2),
    peerId: testId(2),
    peerName: "Peer",
    peerSlug: "peer",
    peerKind: "person",
    predicate: "related_to",
    confidence: "possible",
    notes: "Met at conference",
    evidenceIds: [],
    direction: "out",
    ...overrides,
  };
}

describe("CompactConnectionList", () => {
  it("renders outbound and inbound sections with counts", () => {
    render(
      <CompactConnectionList
        outbound={[edge()]}
        inbound={[
          edge({ id: testId(11), direction: "in", peerName: "Inbound Peer" }),
        ]}
        onEdit={vi.fn()}
        onRemove={vi.fn()}
      />
    );
    expect(screen.getByText("Outbound")).toBeInTheDocument();
    expect(screen.getByText("Inbound")).toBeInTheDocument();
    expect(screen.getByText("Peer")).toBeInTheDocument();
    expect(screen.getByText("Inbound Peer")).toBeInTheDocument();
    expect(screen.getAllByText("Met at conference")).toHaveLength(2);
  });

  it("renders nothing when both directions are empty", () => {
    const { container } = render(
      <CompactConnectionList
        outbound={[]}
        inbound={[]}
        onEdit={vi.fn()}
        onRemove={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });
});

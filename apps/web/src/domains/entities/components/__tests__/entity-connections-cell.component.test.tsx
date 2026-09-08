import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EntityConnectionsCell } from "@/domains/entities/components/entity-connections-cell";
import type { EntityRecord } from "@/domains/entities/types";
import { testId } from "@watchdog/test-kit";

vi.mock("@/domains/entities/components/connection-composer-fields", () => ({
  ConnectionComposerFields: () => <div>Composer fields</div>,
}));

const ENTITY: EntityRecord = {
  id: testId(1),
  caseId: testId(10),
  slug: "alpha",
  name: "Alpha Entity",
  kind: "person",
  summary: null,
  notes: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("EntityConnectionsCell", () => {
  it("shows empty marker and add control when there are no peers", () => {
    render(
      <EntityConnectionsCell
        entity={ENTITY}
        peers={[]}
        entityOptions={[
          { id: testId(2), name: "Beta", slug: "beta", kind: "person" },
        ]}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
      />
    );

    expect(screen.getByText("—")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add connection for Alpha Entity" })
    ).toBeInTheDocument();
  });

  it("renders direction arrow chips with phrase tooltips", () => {
    render(
      <EntityConnectionsCell
        entity={ENTITY}
        peers={[
          {
            edgeId: testId(3),
            peerId: testId(2),
            peerName: "John Doe",
            peerSlug: "john",
            peerKind: "person",
            peerSummary: null,
            peerNotes: null,
            predicate: "associate_of",
            direction: "out",
            notes: null,
            fromId: ENTITY.id,
            toId: testId(2),
          },
          {
            edgeId: testId(4),
            peerId: testId(5),
            peerName: "Acme",
            peerSlug: "acme",
            peerKind: "org",
            peerSummary: null,
            peerNotes: null,
            predicate: "associate_of",
            direction: "in",
            notes: null,
            fromId: testId(5),
            toId: ENTITY.id,
          },
        ]}
        entityOptions={[
          { id: testId(2), name: "John Doe", slug: "john", kind: "person" },
          { id: testId(5), name: "Acme", slug: "acme", kind: "org" },
        ]}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
      />
    );

    expect(
      screen.getByRole("button", {
        name: /Edit connection Associate of John Doe/i,
      })
    ).toHaveAttribute("title", "Associate of John Doe");
    expect(
      screen.getByRole("button", { name: /Edit connection Associate of Acme/i })
    ).toHaveAttribute("title", "Associate of Acme");
    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.getByText("Acme")).toBeInTheDocument();
  });

  it("falls back to peer slug when the peer has no display name", () => {
    render(
      <EntityConnectionsCell
        entity={ENTITY}
        peers={[
          {
            edgeId: testId(6),
            peerId: testId(7),
            peerName: "",
            peerSlug: "acme-corp",
            peerKind: "org",
            peerSummary: null,
            peerNotes: null,
            predicate: "hosted_on",
            direction: "out",
            notes: null,
            fromId: ENTITY.id,
            toId: testId(7),
          },
        ]}
        entityOptions={[]}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
      />
    );

    expect(screen.getByText("acme-corp")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /Edit connection Hosted on acme-corp/i,
      })
    ).toHaveAttribute("title", "Hosted on acme-corp");
  });
});

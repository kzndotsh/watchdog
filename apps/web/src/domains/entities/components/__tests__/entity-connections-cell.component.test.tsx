import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import { EntityConnectionsCell } from "@/domains/entities/components/entity-connections-cell";
import type { EdgeRecord } from "@/domains/entities/edges/types";
import {
  buildEntityListConnection,
  buildEntityListItem,
} from "@/testing/records";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

vi.mock("@/domains/entities/components/connection-composer-fields", () => ({
  ConnectionComposerFields: () => <div>Composer fields</div>,
}));

const listEdgesFn = vi.hoisted(() => vi.fn());

vi.mock("@/domains/entities/edges/edges.functions", () => ({
  listEdgesFn,
  listEdgesForCaseFn: vi.fn(),
}));

const CASE_ID = testCaseId(10);
const ENTITY = buildEntityListItem({
  id: testId(20),
  name: "Alpha Entity",
  slug: "alpha",
  kind: "person",
});

function renderCell(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>
  );
}

const handlers = {
  onCreate: vi.fn(),
  onUpdate: vi.fn(),
  onDelete: vi.fn(),
};

describe("EntityConnectionsCell", () => {
  it("shows the add control when the Entity has no Connections", () => {
    renderCell(
      <EntityConnectionsCell entity={ENTITY} caseId={CASE_ID} {...handlers} />
    );

    expect(
      screen.getByRole("button", { name: "Add connection for Alpha Entity" })
    ).toBeInTheDocument();
    expect(listEdgesFn).not.toHaveBeenCalled();
  });

  it("names the one Connection from the row, with its phrase as the tooltip", () => {
    renderCell(
      <EntityConnectionsCell
        entity={{
          ...ENTITY,
          connections: { outgoing: 1, incoming: 0 },
          soleConnection: buildEntityListConnection({
            peerName: "",
            peerSlug: "acme-corp",
            peerKind: "org",
            predicate: "hosted_on",
          }),
        }}
        caseId={CASE_ID}
        {...handlers}
      />
    );

    expect(screen.getByText("acme-corp")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /Edit connection Hosted on acme-corp/i,
      })
    ).toHaveAttribute("title", "Hosted on acme-corp");
    expect(listEdgesFn).not.toHaveBeenCalled();
  });

  it("collapses several Connections to direction counts and reads them only when opened", async () => {
    const user = userEvent.setup();
    const edge = (n: number, peerName: string): EdgeRecord => ({
      ...buildEntityListConnection({
        id: testId(40 + n),
        peerId: testId(50 + n),
        peerName,
        peerSlug: peerName.toLowerCase(),
      }),
      evidenceIds: [],
    });
    listEdgesFn.mockResolvedValue([edge(2, "Zed"), edge(1, "Acme")]);
    renderCell(
      <EntityConnectionsCell
        entity={{
          ...ENTITY,
          connections: { outgoing: 1, incoming: 1 },
          soleConnection: null,
        }}
        caseId={CASE_ID}
        {...handlers}
      />
    );

    const counts = screen.getByRole("button", { name: "2 connections" });
    expect(counts).toHaveAttribute("title", "1 outgoing, 1 incoming");
    expect(
      screen.queryByRole("button", { name: /Edit connection/i })
    ).not.toBeInTheDocument();
    expect(listEdgesFn).not.toHaveBeenCalled();

    await user.click(counts);
    const acme = await screen.findByRole("button", { name: /Acme/ });
    expect(listEdgesFn).toHaveBeenCalledWith({
      data: { caseId: CASE_ID, entityId: ENTITY.id },
    });
    // Sorted by peer label.
    expect(acme.compareDocumentPosition(screen.getByText("Zed"))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  it("unlinks the one Connection from the popover footer when editing", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    const sole = buildEntityListConnection({ fromId: ENTITY.id });

    renderCell(
      <EntityConnectionsCell
        entity={{
          ...ENTITY,
          connections: { outgoing: 1, incoming: 0 },
          soleConnection: sole,
        }}
        caseId={CASE_ID}
        {...handlers}
        onDelete={onDelete}
      />
    );

    await user.click(
      screen.getByRole("button", {
        name: /Edit connection Associate of John Doe/i,
      })
    );
    await user.click(screen.getByRole("button", { name: "Unlink John Doe" }));

    expect(onDelete).toHaveBeenCalledWith(sole.id);
  });
});

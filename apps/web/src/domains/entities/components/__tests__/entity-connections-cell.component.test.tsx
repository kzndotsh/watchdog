import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import { EntityConnectionsCell } from "@/domains/entities/components/entity-connections-cell";
import {
  buildCaseEdgeRecord,
  buildEntityListConnection,
  buildEntityListItem,
} from "@/testing/records";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

vi.mock("@/domains/entities/components/connection-composer-fields", () => ({
  ConnectionComposerFields: () => <div>Composer fields</div>,
}));

const listEdgesPageFn = vi.hoisted(() => vi.fn());

vi.mock("@/domains/entities/edges/edges.functions", () => ({
  listEdgesPageFn,
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
    expect(listEdgesPageFn).not.toHaveBeenCalled();
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
    expect(listEdgesPageFn).not.toHaveBeenCalled();
  });

  it("collapses several Connections to direction counts and reads them only when opened", async () => {
    const user = userEvent.setup();
    // The list's rows carry both ends: one outbound (Alpha owns Zed), one inbound (Acme leads Alpha).
    listEdgesPageFn.mockResolvedValue({
      items: [
        buildCaseEdgeRecord({
          id: testId(41),
          predicate: "owns",
          fromId: ENTITY.id,
          fromName: ENTITY.name,
          toId: testId(51),
          toName: "Zed",
          toSlug: "zed",
        }),
        buildCaseEdgeRecord({
          id: testId(42),
          predicate: "leads",
          fromId: testId(52),
          fromName: "Acme",
          fromSlug: "acme",
          toId: ENTITY.id,
          toName: ENTITY.name,
        }),
      ],
      nextCursor: null,
      total: { count: 2, isCapped: false },
    });
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
    expect(listEdgesPageFn).not.toHaveBeenCalled();

    await user.click(counts);
    const zed = await screen.findByRole("button", { name: /Zed/ });
    // One page of the Connection list with the Entity fixed, in the list's own order.
    expect(listEdgesPageFn).toHaveBeenCalledTimes(1);
    expect(listEdgesPageFn).toHaveBeenCalledWith({
      data: expect.objectContaining({ caseId: CASE_ID, entityId: ENTITY.id }),
    });
    expect(zed).toHaveTextContent("Owns");
    expect(screen.getByRole("button", { name: /Acme/ })).toHaveTextContent(
      "Led by"
    );
    expect(zed.compareDocumentPosition(screen.getByText("Acme"))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  it("reads one page only, and says how many more the Dossier lists", async () => {
    const user = userEvent.setup();
    listEdgesPageFn.mockResolvedValue({
      items: [
        buildCaseEdgeRecord({
          id: testId(43),
          fromId: ENTITY.id,
          toName: "Hub peer",
        }),
      ],
      nextCursor: "1",
      total: { count: 120, isCapped: false },
    });
    renderCell(
      <EntityConnectionsCell
        entity={{
          ...ENTITY,
          connections: { outgoing: 100, incoming: 20 },
          soleConnection: null,
        }}
        caseId={CASE_ID}
        {...handlers}
      />
    );
    await user.click(screen.getByRole("button", { name: "120 connections" }));
    expect(await screen.findByText(/Showing 1 of 120/)).toBeInTheDocument();
    expect(listEdgesPageFn).toHaveBeenCalledTimes(1);
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

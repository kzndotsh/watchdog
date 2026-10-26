import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLayoutEffect } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/ui/intake/searched-evidence-picker", () => ({
  SearchedEvidencePicker: () => <div>Evidence picker</div>,
}));

/** What the server-searched peer picker offers (it searches the Case's Entities, #559). */
const offeredPeers = vi.hoisted(() => [
  { id: "peer-1", name: "Peer One", slug: "peer-1", kind: "person" },
  { id: "peer-2", name: "Peer Two", slug: "peer-2", kind: "person" },
]);

/** The peer the combobox showed on each committed render. */
const committedPeers = vi.hoisted(() => [] as string[]);

vi.mock("@/shared/ui/searched-entity-combobox", () => ({
  SearchedEntityCombobox: ({
    value,
    onValueChange,
    "aria-label": ariaLabel,
  }: {
    value: string;
    onValueChange: (next: string) => void;
    "aria-label"?: string;
  }) => {
    useLayoutEffect(() => {
      committedPeers.push(value);
    });
    return (
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => {
          onValueChange(event.target.value);
        }}
      >
        <option value="">Select…</option>
        {offeredPeers.map((entity) => (
          <option key={entity.id} value={entity.id}>
            {entity.name}
          </option>
        ))}
      </select>
    );
  },
}));

vi.mock("@/shared/ui/field-combobox", () => ({
  FieldCombobox: ({ "aria-label": ariaLabel }: { "aria-label"?: string }) => (
    <input aria-label={ariaLabel} readOnly value="related_to|forward" />
  ),
}));

import { ConnectionDialog } from "@/domains/dossier/components/ego-graph/connection-dialog";
import type { EdgeRecord } from "@/domains/entities/edges/types";
import { preloadSharedLazyChunks } from "@/testing/shared-lazy-chunks";
import { testId } from "@watchdog/test-kit";

beforeAll(preloadSharedLazyChunks);

describe("ConnectionDialog", () => {
  it("renders create mode with required related_to notes label", () => {
    render(
      <ConnectionDialog
        open
        onOpenChange={vi.fn()}
        mode="create"
        center={{
          id: "center-1",
          name: "Alpha",
          slug: "alpha",
          kind: "person",
        }}
        caseId="case-1"
        onSubmit={vi.fn()}
      />
    );

    expect(
      screen.getByRole("heading", { name: "Add connection" })
    ).toBeInTheDocument();
    expect(screen.getByText("Why (required)")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Short why…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
  });

  const CENTER = {
    id: "center-1",
    name: "Alpha",
    slug: "alpha",
    kind: "person",
  } as const;

  function edge(n: number, peerId: string, notes: string): EdgeRecord {
    return {
      version: 1,
      id: testId(n),
      fromId: CENTER.id,
      toId: peerId,
      predicate: "related_to",
      confidence: "unverified",
      notes,
      evidenceIds: [],
      peerId,
      peerName: peerId,
      peerSlug: peerId,
      peerKind: "person",
      direction: "out",
    };
  }

  function dialog(
    props: { mode: "create" | "edit"; initial?: EdgeRecord | null },
    open = true
  ) {
    return (
      <ConnectionDialog
        open={open}
        onOpenChange={vi.fn()}
        center={CENTER}
        caseId="case-1"
        onSubmit={vi.fn()}
        {...props}
      />
    );
  }

  it("shows the other connection when the edited edge switches, with no flash of the old one", () => {
    const first = edge(1, "peer-1", "Why one");
    const second = edge(2, "peer-2", "Why two");
    const view = render(dialog({ mode: "edit", initial: first }));
    expect(screen.getByLabelText("Peer entity")).toHaveValue("peer-1");
    committedPeers.length = 0;

    view.rerender(dialog({ mode: "edit", initial: second }));

    expect(screen.getByLabelText("Peer entity")).toHaveValue("peer-2");
    expect(screen.getByPlaceholderText("Short why…")).toHaveValue("Why two");
    expect(committedPeers.length).toBeGreaterThan(0);
    expect(new Set(committedPeers)).toEqual(new Set(["peer-2"]));
  });

  it("starts empty when an edit gives way to adding a connection", () => {
    const view = render(
      dialog({ mode: "edit", initial: edge(1, "peer-1", "Why one") })
    );
    committedPeers.length = 0;

    view.rerender(dialog({ mode: "create" }));

    expect(screen.getByLabelText("Peer entity")).toHaveValue("");
    expect(new Set(committedPeers)).toEqual(new Set([""]));
  });

  it("starts a fresh form when the connection is added from another center entity", async () => {
    const user = userEvent.setup();
    const view = render(dialog({ mode: "create" }));
    await user.type(screen.getByPlaceholderText("Short why…"), "scratch");

    view.rerender(
      <ConnectionDialog
        open
        onOpenChange={vi.fn()}
        mode="create"
        center={{ ...CENTER, id: "center-2", slug: "other" }}
        caseId="case-1"
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByPlaceholderText("Short why…")).toHaveValue("");
  });

  it("drops unsaved edits when the dialog is closed and opened again", async () => {
    const user = userEvent.setup();
    const view = render(dialog({ mode: "create" }));
    await user.type(screen.getByPlaceholderText("Short why…"), "scratch");

    view.rerender(dialog({ mode: "create" }, false));
    await waitFor(() => {
      expect(
        screen.queryByPlaceholderText("Short why…")
      ).not.toBeInTheDocument();
    });
    view.rerender(dialog({ mode: "create" }));

    expect(screen.getByPlaceholderText("Short why…")).toHaveValue("");
  });
});

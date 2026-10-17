import { render as rtlRender, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { useLayoutEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EntityRecord } from "@/domains/entities/types";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

/** The summary the editor showed on each committed render. */
const committedSummaries = vi.hoisted(() => [] as string[]);

vi.mock("@/shared/ui/rich-text", () => ({
  RichTextEditor: ({
    value,
    onChange,
    ariaLabel,
    placeholder,
  }: {
    value: string;
    onChange: (next: string) => void;
    ariaLabel?: string;
    placeholder?: string;
  }) => {
    useLayoutEffect(() => {
      if (ariaLabel === "Summary") committedSummaries.push(value);
    });
    return (
      <textarea
        aria-label={ariaLabel ?? placeholder ?? "Rich text editor"}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    );
  },
}));

import { DossierEditDialog } from "@/domains/dossier/components/dossier-edit-dialog";
import { createTestRouter, testRouterWrapper } from "@/testing/test-router";

/** The component reads the router (unsaved-changes guard), so it renders under a real one. */
let router = createTestRouter();
const render = (ui: ReactElement) =>
  rtlRender(ui, { wrapper: testRouterWrapper(router) });

beforeEach(() => {
  router = createTestRouter();
});

const ENTITY: EntityRecord = {
  id: testId(1),
  caseId: testCaseId(10),
  slug: "alpha",
  name: "Alpha Entity",
  kind: "person",
  summary: "Lead subject",
  notes: "Working notes",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("DossierEditDialog", () => {
  it("prefills entity fields when open", () => {
    render(
      <DossierEditDialog
        open
        onOpenChange={vi.fn()}
        entity={ENTITY}
        onSubmit={vi.fn()}
      />
    );
    expect(
      screen.getByRole("heading", { name: "Edit entity" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Entity name")).toHaveValue("Alpha Entity");
    expect(screen.getByLabelText("Summary")).toHaveValue("Lead subject");
    expect(screen.getByLabelText("Notes")).toHaveValue("Working notes");
  });

  const BETA: EntityRecord = {
    ...ENTITY,
    id: testId(2),
    slug: "beta",
    name: "Beta Entity",
    kind: "org",
    summary: "Second subject",
    notes: "Other notes",
  };

  function dialog(entity: EntityRecord, open: boolean) {
    return (
      <DossierEditDialog
        open={open}
        onOpenChange={vi.fn()}
        entity={entity}
        onSubmit={vi.fn()}
      />
    );
  }

  it("shows the new entity when the dialog opens after the record changed, with no flash of the old values", () => {
    const view = render(dialog(ENTITY, false));
    committedSummaries.length = 0;

    view.rerender(dialog(BETA, true));

    expect(screen.getByLabelText("Entity name")).toHaveValue("Beta Entity");
    expect(screen.getByLabelText("Summary")).toHaveValue("Second subject");
    expect(screen.getByLabelText("Notes")).toHaveValue("Other notes");
    expect(committedSummaries.length).toBeGreaterThan(0);
    expect(new Set(committedSummaries)).toEqual(new Set(["Second subject"]));
  });

  it("shows the new entity when the record switches while the dialog is open", () => {
    const view = render(dialog(ENTITY, true));
    committedSummaries.length = 0;

    view.rerender(dialog(BETA, true));

    expect(screen.getByLabelText("Entity name")).toHaveValue("Beta Entity");
    expect(new Set(committedSummaries)).toEqual(new Set(["Second subject"]));
  });

  it("drops unsaved edits when the dialog is closed and opened again", async () => {
    const user = userEvent.setup();
    const view = render(dialog(ENTITY, true));
    const name = screen.getByLabelText("Entity name");
    await user.clear(name);
    await user.type(name, "Scratch");
    expect(name).toHaveValue("Scratch");

    view.rerender(dialog(ENTITY, false));
    await waitFor(() => {
      expect(screen.queryByLabelText("Entity name")).not.toBeInTheDocument();
    });
    view.rerender(dialog(ENTITY, true));

    expect(screen.getByLabelText("Entity name")).toHaveValue("Alpha Entity");
  });

  it("asks before leaving the page with edits typed into the dialog", async () => {
    const user = userEvent.setup();
    render(dialog(ENTITY, true));
    await user.type(screen.getByLabelText("Entity name"), " Jr");

    router.history.push("/elsewhere");

    expect(
      await screen.findByRole("alertdialog", {
        name: "Discard unsaved changes?",
      })
    ).toHaveTextContent("your edits to this entity");
    expect(router.history.location.pathname).toBe("/");
    expect(screen.getByLabelText("Entity name")).toHaveValue("Alpha Entity Jr");

    await user.click(screen.getByRole("button", { name: "Discard Changes" }));
    await waitFor(() => {
      expect(router.history.location.pathname).toBe("/elsewhere");
    });
  });

  it("navigates without asking when the dialog holds no edits", async () => {
    render(dialog(ENTITY, true));

    router.history.push("/elsewhere");

    await waitFor(() => {
      expect(router.history.location.pathname).toBe("/elsewhere");
    });
  });
});

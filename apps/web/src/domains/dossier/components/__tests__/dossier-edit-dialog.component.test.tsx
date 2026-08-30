import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { EntityRecord } from "@/domains/entities/types";
import { testId } from "@watchdog/test-kit";

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
  }) => (
    <textarea
      aria-label={ariaLabel ?? placeholder ?? "Rich text editor"}
      value={value}
      onChange={(event) => {
        onChange(event.target.value);
      }}
    />
  ),
}));

import { DossierEditDialog } from "@/domains/dossier/components/dossier-edit-dialog";

const ENTITY: EntityRecord = {
  id: testId(1),
  caseId: testId(10),
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
});

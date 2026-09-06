import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/shared/ui/intake/evidence-picker", () => ({
  EvidencePicker: () => <div>Evidence picker</div>,
}));

vi.mock("@/shared/ui/entity-combobox", () => ({
  EntityCombobox: ({
    entities,
    value,
    onValueChange,
    "aria-label": ariaLabel,
  }: {
    entities: { id: string; name: string }[];
    value: string;
    onValueChange: (next: string) => void;
    "aria-label"?: string;
  }) => (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => {
        onValueChange(event.target.value);
      }}
    >
      <option value="">Select…</option>
      {entities.map((entity) => (
        <option key={entity.id} value={entity.id}>
          {entity.name}
        </option>
      ))}
    </select>
  ),
}));

vi.mock("@/shared/ui/field-combobox", () => ({
  FieldCombobox: ({ "aria-label": ariaLabel }: { "aria-label"?: string }) => (
    <input aria-label={ariaLabel} readOnly value="related_to|forward" />
  ),
}));

import { ConnectionDialog } from "@/domains/dossier/components/ego-graph/connection-dialog";

describe("ConnectionDialog", () => {
  it("renders create mode with required related_to notes label", () => {
    render(
      <ConnectionDialog
        open
        onOpenChange={vi.fn()}
        mode="create"
        center={{ id: "center-1", name: "Alpha", kind: "person" }}
        entities={[{ id: "peer-1", name: "Peer", kind: "person" }]}
        evidenceOptions={[]}
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
});

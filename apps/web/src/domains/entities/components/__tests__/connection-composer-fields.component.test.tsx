import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ConnectionComposerFields } from "@/domains/entities/components/connection-composer-fields";
import { edgePhraseValue } from "@/shared/ui/vocab/edge-predicate";

vi.mock("@/shared/ui/field-combobox", () => ({
  FieldCombobox: ({
    value,
    onValueChange,
    "aria-label": ariaLabel,
  }: {
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
      <option value={edgePhraseValue("related_to", "forward")}>
        Related to
      </option>
    </select>
  ),
}));

vi.mock("@/shared/ui/entity-combobox", () => ({
  EntityCombobox: ({
    value,
    onValueChange,
    entities,
    "aria-label": ariaLabel,
  }: {
    value: string;
    onValueChange: (next: string) => void;
    entities: { id: string; name: string }[];
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

describe("ConnectionComposerFields", () => {
  it("shows notes input when relationship is related_to", () => {
    render(
      <ConnectionComposerFields
        centerKind="person"
        peerOptions={[
          { id: "peer-1", name: "Beta", slug: "beta", kind: "person" },
        ]}
        values={{
          peerId: "peer-1",
          phraseValue: edgePhraseValue("related_to", "forward"),
          notes: "",
        }}
        onChange={vi.fn()}
      />
    );

    expect(
      screen.getByRole("combobox", { name: "Connection relationship" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Connection peer" })
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Notes" })).toBeInTheDocument();
  });

  it("filters peer options for the selected relationship", () => {
    render(
      <ConnectionComposerFields
        centerKind="person"
        peerOptions={[
          { id: "peer-person", name: "Person", slug: "person", kind: "person" },
          { id: "peer-org", name: "Org", slug: "org", kind: "org" },
          { id: "peer-infra", name: "Infra", slug: "infra", kind: "infra" },
        ]}
        values={{
          peerId: "",
          phraseValue: edgePhraseValue("operates", "forward"),
          notes: "",
        }}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByRole("option", { name: "Org" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Infra" })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Person" })
    ).not.toBeInTheDocument();
  });
});

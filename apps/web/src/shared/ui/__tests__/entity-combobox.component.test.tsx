import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EntityCombobox } from "@/shared/ui/entity-combobox";

describe("EntityCombobox", () => {
  it("returns null when hideWhenEmpty and there are no entities", () => {
    const { container } = render(
      <EntityCombobox
        entities={[]}
        value=""
        onValueChange={() => {}}
        hideWhenEmpty
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the selected entity label", () => {
    render(
      <EntityCombobox
        entities={[{ id: "ent-1", name: "Jane Doe", kind: "person" }]}
        value="ent-1"
        onValueChange={() => {}}
        allowEmpty={false}
      />
    );
    expect(screen.getByDisplayValue("Jane Doe")).toBeInTheDocument();
  });

  it("shows the empty option placeholder when allowEmpty is true", () => {
    render(
      <EntityCombobox
        entities={[]}
        value=""
        onValueChange={() => {}}
        emptyLabel="No entity"
      />
    );
    expect(screen.getByPlaceholderText("No entity")).toBeInTheDocument();
  });

  it("falls back to slug when name is blank", () => {
    render(
      <EntityCombobox
        entities={[{ id: "ent-1", name: "", slug: "acme-corp", kind: "org" }]}
        value="ent-1"
        onValueChange={() => {}}
        allowEmpty={false}
      />
    );
    expect(screen.getByDisplayValue("acme-corp")).toBeInTheDocument();
  });

  it("matches a padded entity id", () => {
    render(
      <EntityCombobox
        entities={[{ id: "ent-1", name: "Jane Doe", kind: "person" }]}
        value="  ent-1  "
        onValueChange={() => {}}
        allowEmpty={false}
      />
    );
    expect(screen.getByDisplayValue("Jane Doe")).toBeInTheDocument();
  });
});

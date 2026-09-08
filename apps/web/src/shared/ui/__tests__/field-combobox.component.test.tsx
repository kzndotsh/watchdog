import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/shared/ui/shadcn/combobox", () => ({
  Combobox: ({
    children,
    onValueChange,
  }: {
    children: React.ReactNode;
    onValueChange?: (
      value: { value: string; label: string } | null,
      details: { reason: string; allowPropagation: () => void }
    ) => void;
  }) => (
    <div>
      <button
        type="button"
        onClick={() => {
          onValueChange?.(
            { value: "alpha", label: "Alpha" },
            { reason: "item-press", allowPropagation: vi.fn() }
          );
        }}
      >
        Pick Alpha
      </button>
      {children}
    </div>
  ),
  ComboboxInput: () => <input aria-label="Field combobox" />,
  ComboboxContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ComboboxList: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ComboboxCollection: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ComboboxGroup: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ComboboxLabel: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ComboboxItem: () => null,
  ComboboxEmpty: () => null,
}));

import { FieldCombobox } from "@/shared/ui/field-combobox";
import { fieldComboboxMatchesQuery } from "@/shared/ui/field-combobox.lib";

describe("fieldComboboxMatchesQuery", () => {
  it("matches label, value, and group text", () => {
    const option = {
      value: "primary_domain:forward",
      label: "Primary domain",
      group: "Infrastructure",
    };
    expect(fieldComboboxMatchesQuery(option, "primary")).toBe(true);
    expect(fieldComboboxMatchesQuery(option, "forward")).toBe(true);
    expect(fieldComboboxMatchesQuery(option, "infra")).toBe(true);
    expect(fieldComboboxMatchesQuery(option, "missing")).toBe(false);
  });
});

describe("FieldCombobox", () => {
  it("commits the selected option value", () => {
    const onValueChange = vi.fn();
    render(
      <FieldCombobox
        value=""
        onValueChange={onValueChange}
        options={[{ value: "alpha", label: "Alpha" }]}
        aria-label="Entity"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Pick Alpha" }));
    expect(onValueChange).toHaveBeenCalledWith("alpha");
  });
});

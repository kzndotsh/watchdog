import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/shared/ui/primitives/combobox", () => ({
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
            { value: "custom", label: "Custom" },
            { reason: "item-press", allowPropagation: vi.fn() }
          );
        }}
      >
        Pick custom
      </button>
      {children}
    </div>
  ),
  ComboboxInput: () => <input aria-label="Suggest" />,
  ComboboxContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ComboboxList: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ComboboxItem: () => null,
  ComboboxEmpty: () => null,
}));

import { EditableSuggestCell } from "@/shared/ui/data-table/editable-suggest-cell";

describe("EditableSuggestCell", () => {
  it("commits a picked suggestion value", () => {
    const onCommit = vi.fn();
    render(
      <EditableSuggestCell
        value=""
        options={[{ value: "alpha", label: "Alpha" }]}
        onCommit={onCommit}
        aria-label="Suggest value"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Pick custom" }));
    expect(onCommit).toHaveBeenCalledWith("custom");
  });
});

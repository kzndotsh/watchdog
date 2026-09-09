import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SearchField } from "@/shared/ui/search-field";

describe("SearchField", () => {
  it("updates value and clears with the clear button", () => {
    const onValueChange = vi.fn();
    render(
      <SearchField
        value="alpha"
        onValueChange={onValueChange}
        aria-label="Search items"
      />
    );

    fireEvent.change(screen.getByLabelText("Search items"), {
      target: { value: "beta" },
    });
    expect(onValueChange).toHaveBeenCalledWith("beta");

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(onValueChange).toHaveBeenCalledWith("");
  });

  it("uses the shared fixed toolbar width", () => {
    const { container } = render(
      <SearchField
        value=""
        onValueChange={() => {
          /* noop */
        }}
        aria-label="Search items"
      />
    );

    expect(container.querySelector("[data-slot=input-group]")).toHaveClass(
      "w-80"
    );
  });
});

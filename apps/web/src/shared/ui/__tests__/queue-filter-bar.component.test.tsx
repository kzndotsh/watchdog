import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { QueueFilterBar } from "@/shared/ui/queue-filter-bar";

describe("QueueFilterBar", () => {
  it("updates search text and shows reset when filters are active", () => {
    const onValueChange = vi.fn();
    const onReset = vi.fn();

    render(
      <QueueFilterBar
        value="alpha"
        onValueChange={onValueChange}
        placeholder="Filter queue"
        aria-label="Filter queue"
        hasActiveFilters
        onReset={onReset}
      />
    );

    fireEvent.change(screen.getByLabelText("Filter queue"), {
      target: { value: "beta" },
    });
    expect(onValueChange).toHaveBeenCalledWith("beta");
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(onReset).toHaveBeenCalled();
  });
});

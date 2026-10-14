import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PageFilterMenu } from "@/shared/layout/page-filter-menu";

describe("PageFilterMenu", () => {
  it("shows active filter count in the trigger label and clears chips", () => {
    const onClear = vi.fn();
    const onClearAll = vi.fn();

    render(
      <PageFilterMenu
        chips={[{ id: "status", label: "Pending", onClear }]}
        onClearAll={onClearAll}
      >
        <div>Filter controls</div>
      </PageFilterMenu>
    );

    expect(
      screen.getByRole("button", { name: "Filters, 1 active" })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove Pending" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { listDisplayStorageKey } from "@/shared/lib/list/list-display-store";
import {
  harnessRows,
  harnessView,
  memoryFetch,
  testQueryClient,
  withClient,
} from "@/shared/ui/list/__tests__/list-test-fixtures";
import { EvidenceHarness } from "@/shared/ui/list/__tests__/list-test-harness";
import {
  loadDisplayBody,
  loadFiltersBody,
} from "@/shared/ui/list/parts/load-popover-bodies";

function renderHarness() {
  return render(
    <EvidenceHarness view={harnessView(memoryFetch(harnessRows(3)))} />,
    { wrapper: withClient(testQueryClient()) }
  );
}

afterEach(() => {
  window.localStorage.removeItem(listDisplayStorageKey("harness"));
});

/* The popover bodies are separate chunks (#560): the buttons render with the toolbar, the body
 * mounts when the chunk is in, and a hover or focus warms it so the open has no placeholder. */
describe("list popovers, lazy bodies", () => {
  it("keeps the buttons eager and loads the Filters body on first open", async () => {
    const user = userEvent.setup();
    renderHarness();
    await screen.findByText("Item 1");

    expect(screen.queryByRole("button", { name: "Add filter" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Filters" }));

    expect(
      await screen.findByRole("button", { name: "Add filter" })
    ).toBeInTheDocument();
    expect(screen.getByText("No filters applied.")).toBeInTheDocument();
    expect(
      document.querySelector("[data-slot='list-popover-fallback']")
    ).toBeNull();
  });

  it("tells a ref source when the Filters popover opens and closes", async () => {
    const user = userEvent.setup();
    const onSourceOpenChange = vi.fn();
    render(
      <EvidenceHarness
        view={harnessView(memoryFetch(harnessRows(3)))}
        onSourceOpenChange={onSourceOpenChange}
      />,
      { wrapper: withClient(testQueryClient()) }
    );
    await screen.findByText("Item 1");
    expect(onSourceOpenChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Filters" }));
    await screen.findByRole("button", { name: "Add filter" });
    expect(onSourceOpenChange).toHaveBeenLastCalledWith(true);

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(onSourceOpenChange).toHaveBeenLastCalledWith(false);
    });
  });

  it("shows the body at once when hover or focus already warmed the chunk", async () => {
    const user = userEvent.setup();
    renderHarness();
    await screen.findByText("Item 1");

    const trigger = screen.getByRole("button", { name: "Display options" });
    await user.hover(trigger);
    // The prefetch shares the memoized import with the lazy body, so this is the same request.
    await loadDisplayBody();
    await user.click(trigger);

    expect(
      screen.getByRole("radiogroup", { name: "Sort" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: "Compact rows" })
    ).toBeInTheDocument();
    expect(
      document.querySelector("[data-slot='list-popover-fallback']")
    ).toBeNull();
  });

  it("shares one request between the prefetch and the open", async () => {
    expect(await loadFiltersBody()).toBe(await loadFiltersBody());
  });
});

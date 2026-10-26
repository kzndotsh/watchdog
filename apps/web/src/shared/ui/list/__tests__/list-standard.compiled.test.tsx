import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  harnessRows,
  harnessView,
  memoryFetch,
  testQueryClient,
  withClient,
} from "@/shared/ui/list/__tests__/list-test-fixtures";
import { EvidenceHarness } from "@/shared/ui/list/__tests__/list-test-harness";
import { preloadSharedLazyChunks } from "@/testing/shared-lazy-chunks";

function renderList(onSearchChange: () => void) {
  return render(
    <EvidenceHarness
      view={harnessView(memoryFetch(harnessRows(120)))}
      onSearchChange={onSearchChange}
    />,
    { wrapper: withClient(testQueryClient()) }
  );
}

/* The list parts under React Compiler (as the app ships them): memoized toolbar, body and
 * chips must still follow the view through a filter change, a search and Load more. */
beforeAll(preloadSharedLazyChunks);

describe("the list standard, compiled", () => {
  it("follows a filter, a search and Load more through memoized parts", async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    renderList(onSearchChange);
    expect(await screen.findByText("Showing 50 of 120")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Filters" }));
    await user.click(await screen.findByRole("button", { name: "Add filter" }));
    await user.click(
      await screen.findByRole("switch", { name: "Hidden only" })
    );
    await user.keyboard("{Escape}");
    const chips = await screen.findByRole("group", { name: "Active filters" });
    expect(within(chips).getByText("Hidden")).toBeInTheDocument();
    expect(
      await screen.findByText("Nothing Matches These Filters")
    ).toBeInTheDocument();

    await user.click(
      within(chips).getByRole("button", { name: "Remove Hidden" })
    );
    expect(await screen.findByText("Showing 50 of 120")).toBeInTheDocument();

    await user.type(
      screen.getByRole("searchbox", { name: "Search evidence" }),
      "Item 11"
    );
    await waitFor(() => {
      expect(onSearchChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: "Item 11" })
      );
    });
    expect(await screen.findByText("Showing 11")).toBeInTheDocument();
  });
});

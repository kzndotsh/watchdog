import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  ACME_ID,
  harnessRows,
  harnessView,
  memoryFetch,
  testQueryClient,
  withClient,
} from "@/shared/ui/list/__tests__/list-test-fixtures";
import {
  EvidenceHarness,
  FixedEntityHarness,
} from "@/shared/ui/list/__tests__/list-test-harness";
import { LIST_MAX_PAGES } from "@watchdog/schemas/shared";

function renderHarness(
  ui: Parameters<typeof render>[0],
  client = testQueryClient()
) {
  return render(ui, { wrapper: withClient(client) });
}

async function openFilters(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /^Filters/ }));
}

describe("the list standard", () => {
  it("applies a filter from the popover and writes it to the URL at once", async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    const fetchPage = vi.fn(memoryFetch(harnessRows(6)));
    renderHarness(
      <EvidenceHarness
        view={harnessView(fetchPage)}
        onSearchChange={onSearchChange}
      />
    );
    await screen.findByText("Item 1");

    await openFilters(user);
    await user.click(screen.getByRole("button", { name: "Add filter" }));
    // The first offered filter is Hidden (declaration order): switch it on.
    await user.click(screen.getByRole("switch", { name: "Hidden only" }));

    expect(onSearchChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ hidden: true })
    );
    await waitFor(() => {
      expect(fetchPage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({ hidden: true }),
        })
      );
    });
  });

  it("shows chips only while filtered, and a chip's × writes the removal", async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    renderHarness(
      <EvidenceHarness
        view={harnessView(memoryFetch(harnessRows(6)))}
        onSearchChange={onSearchChange}
      />
    );
    await screen.findByText("Item 1");
    expect(
      screen.queryByRole("group", { name: "Active filters" })
    ).not.toBeInTheDocument();

    await openFilters(user);
    await user.click(screen.getByRole("button", { name: "Add filter" }));
    await user.click(screen.getByRole("switch", { name: "Hidden only" }));
    await user.keyboard("{Escape}");

    const chips = await screen.findByRole("group", { name: "Active filters" });
    await user.click(
      within(chips).getByRole("button", { name: "Remove Hidden" })
    );

    expect(onSearchChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ hidden: undefined })
    );
    expect(
      screen.queryByRole("group", { name: "Active filters" })
    ).not.toBeInTheDocument();
  });

  it("names a ref chip by its record's title, never its id", async () => {
    renderHarness(
      <EvidenceHarness
        view={harnessView(memoryFetch(harnessRows(6)))}
        initialSearch={{ entityId: ACME_ID }}
      />
    );
    const chips = await screen.findByRole("group", { name: "Active filters" });
    expect(within(chips).getByText("Entity: Acme Ltd")).toBeInTheDocument();
    expect(chips.textContent).not.toContain(ACME_ID);
  });

  it("says “No … yet” with the add action when nothing exists", async () => {
    renderHarness(
      <EvidenceHarness
        view={harnessView(memoryFetch([]))}
        blankAction={<button type="button">Dump a URL</button>}
      />
    );
    expect(await screen.findByText("No Evidence Yet")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Dump a URL" })
    ).toBeInTheDocument();
    expect(screen.queryByText(/Nothing Matches/)).not.toBeInTheDocument();
  });

  it("says “Nothing matches these filters”, never the blank copy, while filtered", async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    renderHarness(
      <EvidenceHarness
        view={harnessView(memoryFetch([]))}
        initialSearch={{ kind: ["attestation"] }}
        onSearchChange={onSearchChange}
        blankAction={<button type="button">Dump a URL</button>}
      />
    );
    expect(
      await screen.findByText("Nothing Matches These Filters")
    ).toBeInTheDocument();
    expect(screen.queryByText("No Evidence Yet")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Dump a URL" })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onSearchChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: undefined, q: undefined })
    );
    expect(await screen.findByText("No Evidence Yet")).toBeInTheDocument();
  });

  it("leaves a fixed filter alone on Clear filters, and never offers or chips it", async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    const fetchPage = vi.fn(memoryFetch([]));
    renderHarness(
      <FixedEntityHarness
        view={harnessView(fetchPage)}
        entityId={ACME_ID}
        onSearchChange={onSearchChange}
      />
    );
    const chips = await screen.findByRole("group", { name: "Active filters" });
    expect(within(chips).queryByText(/Entity/)).not.toBeInTheDocument();

    await user.click(
      await screen.findByRole("button", { name: "Clear filters" })
    );
    const patch: unknown = onSearchChange.mock.lastCall?.[0];
    expect(patch).toEqual(expect.objectContaining({ kind: undefined }));
    expect(patch).not.toHaveProperty("entityId");
    await waitFor(() => {
      expect(fetchPage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({ entityId: ACME_ID }),
        })
      );
    });
    // Unfiltered again, so the tab reads as blank rather than no-match.
    expect(await screen.findByText("No Evidence Yet")).toBeInTheDocument();

    await openFilters(user);
    await user.click(screen.getByRole("button", { name: "Add filter" }));
    await user.click(screen.getByRole("combobox", { name: "Filter" }));
    expect(
      screen.queryByRole("option", { name: "Entity" })
    ).not.toBeInTheDocument();
  });

  it("counts what is loaded against the total and pages with Load more", async () => {
    const user = userEvent.setup();
    renderHarness(
      <EvidenceHarness view={harnessView(memoryFetch(harnessRows(120)))} />
    );
    expect(await screen.findByText("Showing 50 of 120")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Showing 100 of 120")).toBeInTheDocument();
  });

  it("stops at the page ceiling and asks to narrow the filters", async () => {
    const user = userEvent.setup();
    const rows = harnessRows(50 * LIST_MAX_PAGES + 30);
    renderHarness(<EvidenceHarness view={harnessView(memoryFetch(rows))} />);
    await screen.findByText(`Showing 50 of ${rows.length}`);
    // Each Load more waits for the page before it.
    const loadFrom = async (page: number): Promise<void> => {
      if (page >= LIST_MAX_PAGES) return;
      await user.click(
        await screen.findByRole("button", { name: "Load more" })
      );
      await screen.findByText(`Showing ${(page + 1) * 50} of ${rows.length}`);
      await loadFrom(page + 1);
    };
    await loadFrom(1);
    expect(
      screen.getByText("Narrow the filters to see more.")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Load more" })
    ).not.toBeInTheDocument();
  });

  it("resets a view to page one once on cursor_stale, then shows the error", async () => {
    const stale = Object.assign(
      new Error(
        "This evidence cursor belongs to another sort, filter or search; start again from the first page"
      ),
      {
        data: { code: "cursor_stale" },
      }
    );
    const fetchPage = vi.fn(async () => {
      throw stale;
    });
    renderHarness(<EvidenceHarness view={harnessView(fetchPage)} />);

    expect(
      await screen.findByRole("button", { name: "Retry" })
    ).toBeInTheDocument();
    // The first failure reset the view (a second fetch); the second one is the error state.
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("announces the count in a polite live region once the view settles", async () => {
    renderHarness(
      <EvidenceHarness view={harnessView(memoryFetch(harnessRows(3)))} />
    );
    const region = await screen.findByRole("status", { name: "" });
    await waitFor(() => {
      expect(region).toHaveTextContent("3 evidence");
    });
    expect(region).toHaveAttribute("aria-live", "polite");
  });

  it("is pending, never “No … yet”, while a new view loads behind an empty one", async () => {
    const user = userEvent.setup();
    const all = memoryFetch(harnessRows(6));
    let release: () => void = () => undefined;
    const fetchPage = vi.fn(async (request: Parameters<typeof all>[0]) => {
      if (request.params.q === undefined) {
        // oxlint-disable-next-line promise/avoid-new -- holds the new view's first page
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      return all(request);
    });
    renderHarness(
      <EvidenceHarness
        view={harnessView(fetchPage)}
        initialSearch={{ q: "zzzz" }}
      />
    );
    expect(
      await screen.findByText("Nothing Matches These Filters")
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => {
      expect(fetchPage).toHaveBeenCalledTimes(2);
    });
    // The new view is loading behind an empty one: neither empty state may show.
    expect(screen.queryByText("No Evidence Yet")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Nothing Matches These Filters")
    ).not.toBeInTheDocument();
    expect(screen.getByText("Loading rows")).toBeInTheDocument();

    release();
    expect(await screen.findByText("Item 1")).toBeInTheDocument();
  });
});

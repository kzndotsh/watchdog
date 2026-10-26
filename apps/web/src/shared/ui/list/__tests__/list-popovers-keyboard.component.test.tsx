import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { listDisplayStorageKey } from "@/shared/lib/list/list-display-store";
import {
  ACME_ID,
  harnessRows,
  harnessView,
  memoryFetch,
  testQueryClient,
  withClient,
} from "@/shared/ui/list/__tests__/list-test-fixtures";
import { EvidenceHarness } from "@/shared/ui/list/__tests__/list-test-harness";
import { preloadSharedLazyChunks } from "@/testing/shared-lazy-chunks";

function renderHarness(initialSearch = {}) {
  return render(
    <EvidenceHarness
      view={harnessView(memoryFetch(harnessRows(6)))}
      initialSearch={initialSearch}
    />,
    { wrapper: withClient(testQueryClient()) }
  );
}

afterEach(() => {
  window.localStorage.removeItem(listDisplayStorageKey("harness"));
});

beforeAll(preloadSharedLazyChunks);

describe("list popovers, keyboard only", () => {
  it("moves focus to the value control when a row's filter is added or changed", async () => {
    const user = userEvent.setup();
    renderHarness();
    await screen.findByText("Item 1");

    const trigger = screen.getByRole("button", { name: "Filters" });
    trigger.focus();
    await user.keyboard("{Enter}");
    const addFilter = await screen.findByRole("button", { name: "Add filter" });
    addFilter.focus();
    await user.keyboard("{Enter}");

    // The new row's value control (Hidden is first in declaration order) takes focus.
    await waitFor(() => {
      expect(screen.getByRole("switch", { name: "Hidden only" })).toHaveFocus();
    });

    // Change the row's filter to Kind: focus lands on Kind's value control.
    screen.getByRole("combobox", { name: "Filter" }).focus();
    await user.keyboard("{Enter}");
    const kindOption = await screen.findByRole("option", { name: "Kind" });
    kindOption.focus();
    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(
        screen.getByRole("combobox", { name: "Kind values" })
      ).toHaveFocus();
    });
  });

  it("closes only the nested picker on Escape, then the popover, returning focus to Filters", async () => {
    const user = userEvent.setup();
    renderHarness({ kind: ["file"] });
    await screen.findByText("Item 1");

    const trigger = screen.getByRole("button", { name: "Filters, 1 active" });
    trigger.focus();
    await user.keyboard("{Enter}");
    const values = await screen.findByRole("combobox", { name: "Kind values" });
    values.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("listbox")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });
    // The Filters popover is still open.
    expect(
      screen.getByRole("button", { name: "Add filter" })
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Add filter" })
      ).not.toBeInTheDocument();
    });
    expect(trigger).toHaveFocus();
  });

  it("moves focus to the next chip after a removal, then to the Filters button", async () => {
    const user = userEvent.setup();
    renderHarness({ kind: ["file"], entityId: ACME_ID });
    const chips = await screen.findByRole("group", { name: "Active filters" });

    within(chips).getByRole("button", { name: "Remove Kind: File" }).focus();
    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Remove Entity: Acme Ltd" })
      ).toHaveFocus();
    });

    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Filters" })).toHaveFocus();
    });
    expect(
      screen.queryByRole("group", { name: "Active filters" })
    ).not.toBeInTheDocument();
  });

  it("works the Display options popover from the keyboard", async () => {
    const user = userEvent.setup();
    renderHarness();
    await screen.findByText("Item 1");

    const trigger = screen.getByRole("button", { name: "Display options" });
    trigger.focus();
    await user.keyboard("{Enter}");
    const sort = await screen.findByRole("radiogroup", { name: "Sort" });
    expect(
      within(sort).getByRole("radio", { name: "Captured, Newest" })
    ).toBeChecked();

    const compact = screen.getByRole("switch", { name: "Compact rows" });
    compact.focus();
    await user.keyboard(" ");
    expect(compact).toBeChecked();

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    });
    expect(trigger).toHaveFocus();
  });
});

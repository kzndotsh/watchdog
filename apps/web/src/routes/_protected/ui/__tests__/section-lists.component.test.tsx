import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ListsSection } from "@/routes/_protected/ui/-section-lists";

describe("ui gallery: Lists", () => {
  it("runs the table and the queue on in-memory data, counting past the cap", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <ListsSection />
      </QueryClientProvider>
    );
    const table = screen.getByTestId("list-specimen-table");
    expect(
      await within(table).findByText("Showing 50 of 1,000+", undefined, {
        timeout: 3000,
      })
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("searchbox", { name: "Search identifiers" })
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("columnheader", { name: "Value" })
    ).toHaveAttribute("aria-sort", "ascending");
    expect(
      within(table).getByRole("columnheader", { name: "Type" })
    ).not.toHaveAttribute("aria-sort");

    // A header starts a declared sort at its first declared direction (Created: newest first).
    await userEvent.click(
      within(table).getByRole("button", { name: "Created" })
    );
    await waitFor(() => {
      expect(
        within(table).getByRole("columnheader", { name: "Created" })
      ).toHaveAttribute("aria-sort", "descending");
    });
    expect(
      within(table).getByRole("columnheader", { name: "Value" })
    ).toHaveAttribute("aria-sort", "none");

    const queue = screen.getByTestId("list-specimen-queue");
    expect(
      await within(queue).findByText(/^Showing 50 of /, undefined, {
        timeout: 3000,
      })
    ).toBeInTheDocument();
  });
});

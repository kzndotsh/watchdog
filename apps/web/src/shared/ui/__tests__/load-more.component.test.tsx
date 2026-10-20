import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LoadMore } from "@/shared/ui/load-more";

function query(overrides: Partial<Parameters<typeof LoadMore>[0]["query"]>) {
  return {
    fetchNextPage: vi.fn(),
    hasNextPage: true,
    isFetchingNextPage: false,
    ...overrides,
  };
}

describe("LoadMore", () => {
  it("asks for the next page on demand", async () => {
    const paged = query({});
    render(<LoadMore query={paged} />);
    await userEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(paged.fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("uses the label it is given", () => {
    render(<LoadMore query={query({})} label="Show older" />);
    expect(
      screen.getByRole("button", { name: "Show older" })
    ).toBeInTheDocument();
  });

  it("renders nothing on the last page", () => {
    render(<LoadMore query={query({ hasNextPage: false })} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows the busy state while the next page is on its way", () => {
    render(<LoadMore query={query({ isFetchingNextPage: true })} />);
    expect(screen.getByRole("button", { name: /Show more/ })).toBeDisabled();
  });
});

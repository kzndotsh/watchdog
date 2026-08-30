import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";

describe("FetchErrorAlert", () => {
  it("renders nothing when error is null", () => {
    const { container } = render(<FetchErrorAlert error={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows destructive alert copy when error is set", () => {
    render(<FetchErrorAlert error="Failed to load evidence" />);
    expect(screen.getByText("Failed to load evidence")).toBeInTheDocument();
  });

  it("calls onRetry when the retry button is clicked", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<FetchErrorAlert error="Failed to load" onRetry={onRetry} />);
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

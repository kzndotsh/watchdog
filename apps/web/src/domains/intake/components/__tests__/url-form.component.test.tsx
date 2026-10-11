import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { UrlForm } from "@/domains/intake/components/url-form";
import { testHttpUrl } from "@watchdog/test-kit";

// Flaked under shuffled file order (#224): task-board-keyboard left a keyboard
// drag lifted, and dnd-kit's leftover document keydown listener swallowed the
// next Space (label "blogpost"). Fixed there (Escape ends the drag); see the
// comment in task-board-keyboard.component.test.tsx.
describe("UrlForm", () => {
  it("submits a source URL and optional label", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(<UrlForm disabled={false} onSubmit={onSubmit} />);

    await user.type(
      screen.getByPlaceholderText("Link or hostname"),
      testHttpUrl("example.test")
    );
    await user.type(screen.getByPlaceholderText("Source page"), "blog post");
    await user.click(screen.getByRole("button", { name: "Add link" }));

    expect(onSubmit).toHaveBeenCalledWith({
      sourceUrl: testHttpUrl("example.test"),
      label: "blog post",
    });
  });

  it("shows enrich hint copy by default", () => {
    render(<UrlForm disabled={false} onSubmit={vi.fn()} />);

    expect(
      screen.getByText(/Saves link metadata as Evidence/)
    ).toBeInTheDocument();
  });
});

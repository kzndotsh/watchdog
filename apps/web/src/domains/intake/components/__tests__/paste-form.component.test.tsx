import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PasteForm } from "@/domains/intake/components/paste-form";
import { testHttpUrl } from "@watchdog/domain/test-kit";

describe("PasteForm", () => {
  it("submits pasted content and optional metadata", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(<PasteForm disabled={false} onSubmit={onSubmit} />);

    await user.type(
      screen.getByPlaceholderText("Paste page text, tool output, notes…"),
      "tool output"
    );
    await user.type(screen.getByPlaceholderText("WHOIS dump"), "whois");
    await user.type(
      screen.getByPlaceholderText("Link or hostname"),
      testHttpUrl("example.test")
    );
    await user.click(screen.getByRole("button", { name: "Add Evidence" }));

    expect(onSubmit).toHaveBeenCalledWith({
      body: "tool output",
      label: "whois",
      sourceUrl: testHttpUrl("example.test"),
    });
  });

  it("keeps submit disabled until content is present", () => {
    render(<PasteForm disabled={false} onSubmit={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Add Evidence" })).toBeDisabled();
  });
});

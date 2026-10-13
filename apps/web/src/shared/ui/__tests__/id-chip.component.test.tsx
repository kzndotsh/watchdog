import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { IdChip } from "@/shared/ui/id-chip";

describe("IdChip", () => {
  it("middle-truncates opaque ids", () => {
    render(<IdChip value="abcdef1234567890abcdef1234567890" />);
    expect(screen.getByText(/abcdef12/)).toBeInTheDocument();
    expect(screen.getByText(/67890/)).toBeInTheDocument();
  });

  it("copies the full value when copyable", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText },
    });

    render(<IdChip value="copy-me" isCopyable />);
    await user.click(screen.getByRole("button", { name: "Copy id" }));

    expect(writeText).toHaveBeenCalledWith("copy-me");
    vi.unstubAllGlobals();
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ClickableIdChip } from "@/shared/ui/clickable-id-chip";

describe("ClickableIdChip", () => {
  it("forwards preview clicks to the handler", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <ClickableIdChip value="abcdef1234567890" onClick={onClick} head={6} />
    );
    await user.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledWith("abcdef1234567890");
  });

  it("renders display label while forwarding the opaque id on click", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const evidenceId = "00000000-0000-4000-8000-000000000099";
    render(
      <ClickableIdChip
        value={evidenceId}
        display="leaked-db.csv"
        onClick={onClick}
      />
    );
    expect(
      screen.getByRole("button", { name: "Preview evidence: leaked-db.csv" })
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledWith(evidenceId);
  });
});

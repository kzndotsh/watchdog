import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DestructiveConfirmDialog } from "@/shared/ui/destructive-confirm-dialog";

describe("DestructiveConfirmDialog", () => {
  it("requires typing the verification phrase before confirming", () => {
    const onConfirm = vi.fn();
    render(
      <DestructiveConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Delete API key"
        confirmLabel="Delete API key"
        verificationPhrase="DELETE"
        onConfirm={onConfirm}
      />
    );

    const confirm = screen.getByRole("button", { name: "Delete API key" });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("DELETE"), {
      target: { value: "DELETE" },
    });
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalled();
  });
});

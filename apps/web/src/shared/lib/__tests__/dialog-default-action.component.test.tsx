import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "@/shared/ui/primitives/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/shared/ui/primitives/dialog";

function Harness({
  onSave,
  secondPrimary = false,
  disabled = false,
  inForm = false,
}: {
  onSave: () => void;
  secondPrimary?: boolean;
  disabled?: boolean;
  inForm?: boolean;
}) {
  const field = <input aria-label="Name" />;
  return (
    <Dialog open>
      <DialogContent>
        <DialogTitle>Edit</DialogTitle>
        {inForm ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
            }}
          >
            {field}
          </form>
        ) : (
          field
        )}
        <textarea aria-label="Notes" />
        <DialogFooter>
          <Button variant="outline">Cancel</Button>
          <Button disabled={disabled} onClick={onSave}>
            Save
          </Button>
          {secondPrimary ? <Button>Save copy</Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

describe("dialog Enter confirms", () => {
  it("clicks the single primary footer button", () => {
    const onSave = vi.fn();
    render(<Harness onSave={onSave} />);
    fireEvent.keyDown(screen.getByLabelText("Name"), { key: "Enter" });
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("leaves Enter to native form submission, textareas, and buttons", () => {
    const onSave = vi.fn();
    render(<Harness onSave={onSave} inForm />);
    fireEvent.keyDown(screen.getByLabelText("Name"), { key: "Enter" });
    fireEvent.keyDown(screen.getByLabelText("Notes"), { key: "Enter" });
    fireEvent.keyDown(screen.getByRole("button", { name: "Cancel" }), {
      key: "Enter",
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it("Mod+Enter confirms from a textarea", () => {
    const onSave = vi.fn();
    render(<Harness onSave={onSave} />);
    fireEvent.keyDown(screen.getByLabelText("Notes"), {
      key: "Enter",
      metaKey: true,
    });
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("does nothing when the default is disabled or ambiguous", () => {
    const onSave = vi.fn();
    const { unmount } = render(<Harness onSave={onSave} disabled />);
    fireEvent.keyDown(screen.getByLabelText("Name"), { key: "Enter" });
    unmount();
    render(<Harness onSave={onSave} secondPrimary />);
    fireEvent.keyDown(screen.getByLabelText("Name"), { key: "Enter" });
    expect(onSave).not.toHaveBeenCalled();
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

vi.mock("@/shared/ui/rich-text", () => ({
  RichTextEditor: ({
    value,
    onChange,
    onBlurShell,
    ariaLabel,
    placeholder,
  }: {
    value: string;
    onChange: (next: string) => void;
    onBlurShell?: () => void;
    ariaLabel?: string;
    placeholder?: string;
  }) => (
    <textarea
      aria-label={ariaLabel ?? placeholder ?? "Rich text editor"}
      value={value}
      onChange={(event) => {
        onChange(event.target.value);
      }}
      onBlur={() => {
        onBlurShell?.();
      }}
    />
  ),
}));

import { IdentifierNotesCell } from "@/shared/ui/identifiers/identifier-notes-cell";

describe("IdentifierNotesCell", () => {
  it("shows Add notes when empty", () => {
    render(
      <IdentifierNotesCell
        identifierId={testId(1)}
        notes=""
        saveNotes={vi.fn()}
      />
    );

    expect(
      screen.getByRole("button", { name: "Add notes" })
    ).toBeInTheDocument();
  });

  it("shows Edit notes when notes exist", () => {
    render(
      <IdentifierNotesCell
        identifierId={testId(2)}
        notes="Work email"
        saveNotes={vi.fn()}
      />
    );

    expect(
      screen.getByRole("button", { name: "Edit notes" })
    ).toBeInTheDocument();
  });

  it("opens the sheet and saves on blur when dirty", async () => {
    const user = userEvent.setup();
    const saveNotes = vi.fn();

    render(
      <IdentifierNotesCell
        identifierId={testId(3)}
        notes=""
        saveNotes={saveNotes}
      />
    );

    await user.click(screen.getByRole("button", { name: "Add notes" }));
    expect(screen.getByText("Notes")).toBeInTheDocument();

    const editor = screen.getByLabelText("Identifier notes");
    await user.clear(editor);
    await user.type(editor, "Seen in dump A");
    await user.tab();

    expect(saveNotes).toHaveBeenCalledWith(testId(3), "Seen in dump A");
  });

  it("does not save on blur when unchanged", async () => {
    const user = userEvent.setup();
    const saveNotes = vi.fn();

    render(
      <IdentifierNotesCell
        identifierId={testId(4)}
        notes="Already saved"
        saveNotes={saveNotes}
      />
    );

    await user.click(screen.getByRole("button", { name: "Edit notes" }));
    await user.click(screen.getByLabelText("Identifier notes"));
    await user.tab();

    expect(saveNotes).not.toHaveBeenCalled();
  });
});

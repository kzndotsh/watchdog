import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

vi.mock("@/shared/ui/rich-text", () => ({
  preloadRichTextEditor: vi.fn(),
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
        version={1}
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
        version={1}
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
        version={1}
        saveNotes={saveNotes}
      />
    );

    await user.click(screen.getByRole("button", { name: "Add notes" }));
    expect(screen.getByText("Notes")).toBeInTheDocument();

    const editor = screen.getByLabelText("Identifier notes");
    await user.clear(editor);
    await user.type(editor, "Seen in dump A");
    await user.tab();

    expect(saveNotes).toHaveBeenCalledWith(testId(3), "Seen in dump A", 1);
  });

  it("does not save on blur when unchanged", async () => {
    const user = userEvent.setup();
    const saveNotes = vi.fn();

    render(
      <IdentifierNotesCell
        identifierId={testId(4)}
        notes="Already saved"
        version={1}
        saveNotes={saveNotes}
      />
    );

    await user.click(screen.getByRole("button", { name: "Edit notes" }));
    await user.click(screen.getByLabelText("Identifier notes"));
    await user.tab();

    expect(saveNotes).not.toHaveBeenCalled();
  });

  it("saves with the version the sheet opened at, not the row's latest (#307)", async () => {
    const user = userEvent.setup();
    const saveNotes = vi.fn();
    const { rerender } = render(
      <IdentifierNotesCell
        identifierId={testId(5)}
        notes="Mine"
        version={4}
        saveNotes={saveNotes}
      />
    );

    await user.click(screen.getByRole("button", { name: "Edit notes" }));
    // Another writer saves while the sheet is open: the row now renders at version 5.
    rerender(
      <IdentifierNotesCell
        identifierId={testId(5)}
        notes="Theirs"
        version={5}
        saveNotes={saveNotes}
      />
    );
    const editor = screen.getByLabelText("Identifier notes");
    await user.type(editor, " edited");
    await user.tab();

    expect(saveNotes).toHaveBeenCalledWith(testId(5), "Mine edited", 4);
  });

  it("keeps the sheet open when the save is refused", async () => {
    const user = userEvent.setup();
    const saveNotes = vi.fn().mockRejectedValue(new Error("stale"));
    render(
      <IdentifierNotesCell
        identifierId={testId(6)}
        notes=""
        version={1}
        saveNotes={saveNotes}
      />
    );

    await user.click(screen.getByRole("button", { name: "Add notes" }));
    await user.type(screen.getByLabelText("Identifier notes"), "draft");
    await user.keyboard("{Escape}");

    expect(saveNotes).toHaveBeenCalled();
    expect(screen.getByLabelText("Identifier notes")).toBeInTheDocument();
  });
});

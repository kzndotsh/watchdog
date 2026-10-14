import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const loads = vi.hoisted(() => ({ count: 0 }));

vi.mock("@/shared/ui/rich-text/rich-text-editor", () => {
  loads.count += 1;
  return {
    RichTextEditor: ({
      value,
      onChange,
      onBlurShell,
      ariaLabel,
    }: {
      value: string;
      onChange: (next: string) => void;
      onBlurShell?: () => void;
      ariaLabel?: string;
    }) => (
      <textarea
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        onBlur={() => {
          onBlurShell?.();
        }}
      />
    ),
  };
});

import { NotesIconCell } from "@/shared/ui/identifiers/notes-icon-cell";

describe("NotesIconCell with the lazy editor", () => {
  it("does not load the editor until the notes control shows intent, then loads it once", async () => {
    render(<NotesIconCell id="n1" notes="" saveNotes={vi.fn()} />);
    expect(loads.count).toBe(0);

    const user = userEvent.setup();
    await user.hover(screen.getByRole("button", { name: "Add notes" }));
    await waitFor(() => {
      expect(loads.count).toBe(1);
    });
    expect(screen.queryByRole("textbox")).toBeNull();

    await user.tab();
    await user.tab({ shift: true });
    expect(loads.count).toBe(1);
  });

  it("opens the Sheet, renders the editor after the import resolves, and saves on close", async () => {
    const saveNotes = vi.fn();
    render(<NotesIconCell id="n2" notes="old" saveNotes={saveNotes} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Edit notes" }));

    const box = await screen.findByRole("textbox", { name: "Notes" });
    expect(box).toHaveValue("old");

    await user.type(box, "!");
    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(saveNotes).toHaveBeenCalledWith("n2", "old!");
    });
  });
});

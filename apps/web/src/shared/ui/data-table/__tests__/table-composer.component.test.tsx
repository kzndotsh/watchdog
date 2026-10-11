import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DataTableAddRow } from "@/shared/ui/data-table/data-table-add-row";
import { tableComposerKeyDown } from "@/shared/ui/data-table/table-composer.lib";

describe("table composer", () => {
  it("fires onClick from the add row", () => {
    const onClick = vi.fn();
    render(
      <table>
        <tbody>
          <DataTableAddRow
            colSpan={2}
            label="Add identifier"
            onClick={onClick}
          />
        </tbody>
      </table>
    );

    fireEvent.click(screen.getByText("Add identifier"));
    expect(onClick).toHaveBeenCalled();
  });

  it("exposes the add row as a keyboard-operable button, not a clickable row", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <table>
        <tbody>
          <DataTableAddRow
            colSpan={2}
            label="Add identifier"
            onClick={onClick}
          />
        </tbody>
      </table>
    );

    const button = screen.getByRole("button", { name: "Add identifier" });
    await user.click(screen.getByRole("row"));
    expect(onClick).not.toHaveBeenCalled();
    await user.tab();
    expect(button).toHaveFocus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("submits or cancels from keyboard shortcuts", () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    const handler = tableComposerKeyDown({
      busy: false,
      canSubmit: true,
      onSubmit,
      onCancel,
    });

    handler({
      key: "Enter",
      shiftKey: false,
      preventDefault: vi.fn(),
    } as never);
    handler({ key: "Escape", preventDefault: vi.fn() } as never);

    expect(onSubmit).toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });
});

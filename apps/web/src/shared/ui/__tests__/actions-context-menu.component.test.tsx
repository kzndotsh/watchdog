import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { skipEditableContextMenu } from "@/shared/lib/skip-editable-context-menu";

describe("skipEditableContextMenu", () => {
  it("stops propagation on input targets", () => {
    render(<input aria-label="cell" />);
    const input = screen.getByLabelText("cell");
    const stop = vi.fn();
    skipEditableContextMenu({
      target: input,
      stopPropagation: stop,
    } as unknown as MouseEvent);
    expect(stop).toHaveBeenCalled();
  });

  it("does not stop on ordinary elements", () => {
    render(<div data-testid="row">Row</div>);
    const row = screen.getByTestId("row");
    const stop = vi.fn();
    skipEditableContextMenu({
      target: row,
      stopPropagation: stop,
    } as unknown as MouseEvent);
    expect(stop).not.toHaveBeenCalled();
  });

  it("wires capture handler on a trigger", () => {
    render(
      <div data-testid="trigger" onContextMenuCapture={skipEditableContextMenu}>
        <input aria-label="editable" />
        <span>plain</span>
      </div>
    );
    const input = screen.getByLabelText("editable");
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    const stopSpy = vi.spyOn(event, "stopPropagation");
    fireEvent(input, event);
    expect(stopSpy).toHaveBeenCalled();
  });
});

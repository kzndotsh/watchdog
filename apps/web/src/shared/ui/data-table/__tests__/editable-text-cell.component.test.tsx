import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { EditableTextCell } from "@/shared/ui/data-table/editable-text-cell";

describe("EditableTextCell", () => {
  it("commits on blur and reverts on escape", () => {
    const onCommit = vi.fn();
    render(
      <EditableTextCell value="Alpha" onCommit={onCommit} aria-label="Name" />
    );

    const input = screen.getByLabelText("Name");
    fireEvent.change(input, { target: { value: "Beta" } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith("Beta");

    fireEvent.change(input, { target: { value: "Gamma" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveValue("Alpha");
  });

  it("sends exactly one commit when the edit is confirmed with Enter (#307)", async () => {
    const onCommit = vi.fn();
    const user = userEvent.setup();
    render(
      <EditableTextCell value="Alpha" onCommit={onCommit} aria-label="Name" />
    );

    const input = screen.getByLabelText("Name");
    await user.clear(input);
    await user.type(input, "Beta");
    await user.keyboard("{Enter}");

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("Beta");
  });
});

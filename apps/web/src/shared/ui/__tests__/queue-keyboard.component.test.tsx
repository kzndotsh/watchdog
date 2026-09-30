import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { useDataHotkeys } from "@/shared/lib/data-hotkey";
import { QueueRow } from "@/shared/ui/queue-row";
import { QueueShell } from "@/shared/ui/queue-shell";

function Queue({ ids }: { ids: string[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <QueueShell header={<div>Header</div>} aria-label="Queue">
      <div role="listbox" aria-label="Rows">
        {ids.map((id) => (
          <QueueRow
            key={id}
            selected={selected === id}
            onClick={() => {
              setSelected(id);
            }}
          >
            {id}
          </QueueRow>
        ))}
      </div>
    </QueueShell>
  );
}

function selectedText() {
  return screen.getByRole("option", { selected: true }).textContent;
}

describe("Queue keyboard flow", () => {
  it("j / k move the selection through rows", () => {
    render(<Queue ids={["one", "two", "three"]} />);
    fireEvent.keyDown(window, { key: "j" });
    expect(selectedText()).toBe("one");
    fireEvent.keyDown(window, { key: "j" });
    fireEvent.keyDown(window, { key: "j" });
    expect(selectedText()).toBe("three");
    fireEvent.keyDown(window, { key: "j" });
    expect(selectedText()).toBe("three");
    fireEvent.keyDown(window, { key: "k" });
    expect(selectedText()).toBe("two");
  });

  it("arrows only move while focus is inside the queue", () => {
    render(<Queue ids={["one", "two"]} />);
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(screen.queryByRole("option", { selected: true })).toBeNull();
    screen.getByText("one").focus();
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(selectedText()).toBe("one");
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(selectedText()).toBe("two");
    expect(document.activeElement?.textContent).toBe("two");
  });
});

function HotkeyHost({
  disabled,
  onPress,
}: {
  disabled: boolean;
  onPress: () => void;
}) {
  useDataHotkeys();
  return (
    <>
      <button
        type="button"
        data-hotkey="a"
        disabled={disabled}
        onClick={onPress}
      >
        Accept
      </button>
      <input aria-label="Note" />
    </>
  );
}

describe("data-hotkey", () => {
  it("clicks the live control for a bare key", () => {
    let presses = 0;
    render(
      <HotkeyHost
        disabled={false}
        onPress={() => {
          presses += 1;
        }}
      />
    );
    fireEvent.keyDown(window, { key: "a" });
    expect(presses).toBe(1);
    fireEvent.keyDown(window, { key: "a", metaKey: true });
    fireEvent.keyDown(screen.getByLabelText("Note"), { key: "a" });
    expect(presses).toBe(1);
  });

  it("skips disabled controls", () => {
    let presses = 0;
    render(
      <HotkeyHost
        disabled
        onPress={() => {
          presses += 1;
        }}
      />
    );
    fireEvent.keyDown(window, { key: "a" });
    expect(presses).toBe(0);
  });
});

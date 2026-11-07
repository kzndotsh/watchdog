import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useDataHotkeys } from "@/domains/search/hooks/use-data-hotkeys";

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

  it("ignores shifted and caps-lock letters", () => {
    let presses = 0;
    render(
      <HotkeyHost
        disabled={false}
        onPress={() => {
          presses += 1;
        }}
      />
    );
    fireEvent.keyDown(window, { key: "A", shiftKey: true });
    fireEvent.keyDown(window, { key: "A" });
    expect(presses).toBe(0);
  });
});

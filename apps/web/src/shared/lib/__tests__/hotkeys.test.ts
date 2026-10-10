import { describe, it, expect, expectTypeOf, vi } from "vitest";

import {
  bareKey,
  chordMatcher,
  createHotkeyListener,
  formatChord,
  HOTKEYS,
  hotkeyAttrs,
  hotkeyBindings,
  isEditableTarget,
  matchesChord,
  type HotkeyBinding,
} from "../hotkeys.ts";

function keyEvent(
  key: string,
  opts: {
    metaKey?: boolean;
    ctrlKey?: boolean;
    altKey?: boolean;
    target?: unknown;
  } = {}
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    metaKey: opts.metaKey ?? false,
    ctrlKey: opts.ctrlKey ?? false,
    altKey: opts.altKey ?? false,
    bubbles: true,
    cancelable: true,
  });
  if (opts.target !== undefined) {
    Object.defineProperty(event, "target", {
      value: opts.target,
      configurable: true,
    });
  }
  return event;
}

describe("matchesChord", () => {
  it("Mod+K matches meta or ctrl", () => {
    const chord = { key: "k", mod: true };
    expect(matchesChord(keyEvent("k", { metaKey: true }), chord)).toBe(true);
    expect(matchesChord(keyEvent("k", { ctrlKey: true }), chord)).toBe(true);
    expect(matchesChord(keyEvent("k"), chord)).toBe(false);
    expect(matchesChord(keyEvent("K", { metaKey: true }), chord)).toBe(true);
  });

  it("bare ? ignores mod chords", () => {
    const chord = { key: "?" };
    expect(matchesChord(keyEvent("?"), chord)).toBe(true);
    expect(matchesChord(keyEvent("?", { metaKey: true }), chord)).toBe(false);
  });
});

describe("isEditableTarget", () => {
  it("detects input and textarea", () => {
    expect(isEditableTarget({ tagName: "INPUT" })).toBe(true);
    expect(isEditableTarget({ tagName: "TEXTAREA" })).toBe(true);
    expect(isEditableTarget({ tagName: "DIV" })).toBe(false);
    expect(isEditableTarget({ isContentEditable: true })).toBe(true);
  });
});

describe("createHotkeyListener", () => {
  it("skips editable unless allowInEditable", () => {
    const runs: string[] = [];
    const input = { tagName: "INPUT" };
    const bindings: HotkeyBinding[] = [
      {
        id: "plain",
        key: "?",
        run: () => {
          runs.push("plain");
        },
      },
      {
        id: "palette",
        key: "k",
        mod: true,
        allowInEditable: true,
        run: () => {
          runs.push("palette");
        },
      },
    ];
    const listener = createHotkeyListener(() => bindings);
    listener(keyEvent("?", { target: input }));
    listener(keyEvent("k", { metaKey: true, target: input }));
    expect(runs).toEqual(["palette"]);
  });
});

describe("registry helpers", () => {
  it("parses and formats chords", () => {
    expect(chordMatcher("Mod+K")).toEqual({ key: "K", mod: true });
    expect(chordMatcher("?")).toEqual({ key: "?" });
    expect(formatChord("Mod+K", "Ctrl")).toBe("Ctrl K");
    expect(formatChord("?", "Ctrl")).toBe("?");
  });

  it("derives data-hotkey attributes from the registry key", () => {
    expect(hotkeyAttrs("triage-accept")).toEqual({
      "data-hotkey": "a",
      "aria-keyshortcuts": "a",
    });
  });

  it("restricts hotkeyAttrs to data-hotkey ids (no modifier-dropping)", () => {
    expectTypeOf<Parameters<typeof hotkeyAttrs>[0]>().toEqualTypeOf<
      "triage-accept" | "triage-reject"
    >();
    expect(
      HOTKEYS.filter((e) => e.owner === "data-hotkey").map((e) => e.id)
    ).toEqual(["triage-accept", "triage-reject"]);
  });

  it("restricts bareKey to bare-key ids (Mod chords excluded)", () => {
    expectTypeOf<Parameters<typeof bareKey>[0]>().toEqualTypeOf<
      | "shortcuts"
      | "queue-next"
      | "queue-previous"
      | "triage-accept"
      | "triage-reject"
    >();
    expect(bareKey("queue-next")).toBe("j");
  });

  it("binds one entry per global registry id", () => {
    const run = vi.fn();
    const bindings = hotkeyBindings({ "command-palette": run, shortcuts: run });
    expect(bindings.map((b) => b.id)).toEqual(
      HOTKEYS.filter((e) => e.owner === "global").map((e) => e.id)
    );
  });
});

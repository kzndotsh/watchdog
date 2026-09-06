/** Global keyboard chords — plain window listener (no react-hotkeys-hook). */

export interface HotkeyChord {
  /** `KeyboardEvent.key` (lowercase compared for letters). */
  key: string;
  /** Require Meta (⌘) or Ctrl. */
  mod?: boolean;
  /** Fire even when focus is in an editable field. */
  allowInEditable?: boolean;
}

export interface HotkeyBinding extends HotkeyChord {
  id: string;
  run: () => void;
}

/** Static catalog for the Shortcuts sheet (not runtime bindings). */
export const HOTKEYS = [
  {
    id: "command-palette",
    label: "Command palette",
    chord: "Mod+K",
    description: "Search the Active Case or jump to a page",
  },
  {
    id: "toggle-sidebar",
    label: "Toggle sidebar",
    chord: "Mod+B",
    description: "Collapse or expand the sidebar",
  },
  {
    id: "shortcuts",
    label: "Shortcuts",
    chord: "?",
    description: "Open this shortcuts list",
  },
] as const;

/** Duck-typed so unit tests work without a DOM. */
export function isEditableTarget(target: unknown): boolean {
  if (target === null || typeof target !== "object") return false;
  if ("isContentEditable" in target && target.isContentEditable === true) {
    return true;
  }
  if ("tagName" in target && typeof target.tagName === "string") {
    const tag = target.tagName.toUpperCase();
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  }
  return false;
}

export function matchesChord(
  event: KeyboardEvent,
  chord: HotkeyChord
): boolean {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const expected = chord.key.length === 1 ? chord.key.toLowerCase() : chord.key;
  if (key !== expected) return false;
  if (chord.mod === true) {
    return event.metaKey || event.ctrlKey;
  }
  // Bare keys must not fire with Mod held (avoids colliding with browser chords).
  return !(event.metaKey || event.ctrlKey || event.altKey);
}

/** Mod key glyph for the current platform (⌘ on Apple, Ctrl elsewhere). */
export function modKeyLabel(): string {
  if (typeof navigator === "undefined") return "Ctrl";
  const platform = navigator.platform ?? "";
  const ua = navigator.userAgent ?? "";
  if (/Mac|iPhone|iPad|iPod/i.test(platform) || /Mac OS/i.test(ua)) {
    return "⌘";
  }
  return "Ctrl";
}

export function createHotkeyListener(
  getBindings: () => readonly HotkeyBinding[]
): (event: KeyboardEvent) => void {
  return (event: KeyboardEvent) => {
    if (event.defaultPrevented) return;
    const editable = isEditableTarget(event.target);
    for (const binding of getBindings()) {
      if (editable && binding.allowInEditable !== true) continue;
      if (!matchesChord(event, binding)) continue;
      event.preventDefault();
      binding.run();
      return;
    }
  };
}

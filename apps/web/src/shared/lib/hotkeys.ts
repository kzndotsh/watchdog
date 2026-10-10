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

/**
 * Who attaches the runtime listener for a registry entry:
 * - `global`: `SearchChrome` via `hotkeyBindings` / `useGlobalHotkeys`.
 * - `sidebar-provider`: the vendored `SidebarProvider` (unpatched); never bind it again.
 * - `queue-keyboard`: `useQueueKeyboard` (`shared/lib/queue-keyboard.ts`).
 * - `data-hotkey`: a control carrying `hotkeyAttrs(id)`, clicked by `useDataHotkeys`.
 */
export type HotkeyOwner =
  | "global"
  | "sidebar-provider"
  | "queue-keyboard"
  | "data-hotkey";

export interface HotkeyDef {
  id: string;
  label: string;
  /** Display and match source: `Mod+K`, `?`, `J`. */
  chord: string;
  description: string;
  owner: HotkeyOwner;
  /** Listed as a Command in the Mod+K palette. */
  palette?: boolean;
  /** Fire even when focus is in an editable field. */
  allowInEditable?: boolean;
}

/**
 * The only definition of a keyboard shortcut. The Shortcuts dialog, palette
 * and menu chords (`AppAction.hotkey`), `hotkeyBindings`, `hotkeyAttrs` and
 * the queue keys all read from here.
 */
export const HOTKEYS = [
  {
    id: "command-palette",
    label: "Command palette",
    chord: "Mod+K",
    description: "Search the Active Case or jump to a page",
    owner: "global",
    allowInEditable: true,
  },
  {
    id: "toggle-sidebar",
    label: "Toggle sidebar",
    chord: "Mod+B",
    description: "Collapse or expand the sidebar",
    owner: "sidebar-provider",
    palette: true,
  },
  {
    id: "shortcuts",
    label: "Shortcuts",
    chord: "?",
    description: "Open this shortcuts list",
    owner: "global",
    palette: true,
  },
  {
    id: "queue-next",
    label: "Next row",
    chord: "J",
    description: "Select the next Queue row (or ↓ while the Queue has focus)",
    owner: "queue-keyboard",
  },
  {
    id: "queue-previous",
    label: "Previous row",
    chord: "K",
    description:
      "Select the previous Queue row (or ↑ while the Queue has focus)",
    owner: "queue-keyboard",
  },
  {
    id: "triage-accept",
    label: "Accept",
    chord: "A",
    description: "Triage: accept the selected Proposal (when the gate allows)",
    owner: "data-hotkey",
  },
  {
    id: "triage-reject",
    label: "Reject",
    chord: "R",
    description: "Triage: open the reject composer for the selected Proposal",
    owner: "data-hotkey",
  },
] as const satisfies readonly HotkeyDef[];

type HotkeyEntry = (typeof HOTKEYS)[number];

export type HotkeyId = HotkeyEntry["id"];

export type GlobalHotkeyId = Extract<HotkeyEntry, { owner: "global" }>["id"];

export function hotkeyDef(id: HotkeyId): HotkeyDef {
  const def = HOTKEYS.find((entry) => entry.id === id);
  if (!def) throw new Error(`Unknown hotkey id: ${id}`);
  return def;
}

/** Match descriptor parsed from a display chord (`Mod+K` -> mod + `k`). */
export function chordMatcher(chord: string): HotkeyChord {
  if (chord.startsWith("Mod+")) {
    return { key: chord.slice("Mod+".length), mod: true };
  }
  return { key: chord };
}

/** Chord text for display, with the mod-key text supplied (`useModKeyLabel`). */
export function formatChord(chord: string, modLabel: string): string {
  return chord.startsWith("Mod+")
    ? `${modLabel} ${chord.slice("Mod+".length)}`
    : chord;
}

/** Attributes that make a control answer to a `data-hotkey` registry key. */
export function hotkeyAttrs(id: HotkeyId): {
  "data-hotkey": string;
  "aria-keyshortcuts": string;
} {
  const key = chordMatcher(hotkeyDef(id).chord).key.toLowerCase();
  return { "data-hotkey": key, "aria-keyshortcuts": key };
}

/** Runtime bindings for every `global` registry entry, in registry order. */
export function hotkeyBindings(
  runners: Readonly<Record<GlobalHotkeyId, () => void>>
): HotkeyBinding[] {
  const bindings: HotkeyBinding[] = [];
  for (const entry of HOTKEYS) {
    if (entry.owner !== "global") continue;
    const def: HotkeyDef = entry;
    bindings.push({
      id: entry.id,
      ...chordMatcher(entry.chord),
      ...(def.allowInEditable === true ? { allowInEditable: true } : {}),
      run: runners[entry.id],
    });
  }
  return bindings;
}

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
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey">,
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

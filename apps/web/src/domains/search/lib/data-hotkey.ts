/** Pure helpers behind `useDataHotkeys` (`shared/hooks/use-data-hotkeys.ts`). */

const DATA_HOTKEY_ATTR = "data-hotkey";

/** Pure: does this element accept a hotkey press right now? */
export function isHotkeyTargetLive(el: Element): boolean {
  if (el.matches(":disabled, [aria-disabled='true'], [data-disabled]")) {
    return false;
  }
  return el.closest("[inert], [aria-hidden='true']") === null;
}

export function findHotkeyTarget(
  root: ParentNode,
  key: string
): HTMLElement | null {
  // Registry keys are lowercase; an uppercase `event.key` means Shift or
  // CapsLock is active, so the bare shortcut stays inert.
  if (key !== key.toLowerCase()) return null;
  const candidates = root.querySelectorAll<HTMLElement>(
    `[${DATA_HOTKEY_ATTR}="${CSS.escape(key)}"]`
  );
  for (const el of candidates) {
    if (isHotkeyTargetLive(el)) return el;
  }
  return null;
}

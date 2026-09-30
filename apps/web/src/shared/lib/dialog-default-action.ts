import type { KeyboardEvent } from "react";

/**
 * Enter confirms a dialog: pressing Enter (or Mod+Enter from a textarea)
 * clicks the dialog's default action. Resolution order:
 *   1. an enabled `[data-dialog-default-action]` control
 *   2. the AlertDialog action (`[data-slot=alert-dialog-action]`)
 *   3. the single enabled primary / destructive Button in the footer
 * Native behaviour wins everywhere it already exists: inside a `<form>`
 * (implicit submit), on buttons / links, in comboboxes / menus, and while an
 * IME is composing. Ambiguous footers (two primaries) do nothing.
 */

const FOOTER_SELECTOR =
  '[data-slot="dialog-footer"], [data-slot="alert-dialog-footer"]';
const PRIMARY_SELECTOR =
  '[data-slot="button"][data-variant="default"], [data-slot="button"][data-variant="destructive"]';

function isEnabled(el: HTMLElement): boolean {
  return !el.matches(":disabled, [aria-disabled='true'], [data-loading]");
}

/** Pure DOM lookup — exported for tests. */
export function findDialogDefaultAction(root: HTMLElement): HTMLElement | null {
  const explicit = root.querySelector<HTMLElement>(
    "[data-dialog-default-action]"
  );
  if (explicit) return isEnabled(explicit) ? explicit : null;

  const alertAction = root.querySelector<HTMLElement>(
    '[data-slot="alert-dialog-action"]'
  );
  if (alertAction) return isEnabled(alertAction) ? alertAction : null;

  const primaries = [...root.querySelectorAll<HTMLElement>(FOOTER_SELECTOR)]
    .flatMap((footer) => [
      ...footer.querySelectorAll<HTMLElement>(PRIMARY_SELECTOR),
    ])
    .filter(isEnabled);
  return primaries.length === 1 ? (primaries[0] ?? null) : null;
}

function targetOwnsEnter(target: HTMLElement, mod: boolean): boolean {
  if (target.closest("form")) return true;
  if (target.closest("button, a[href], [role='button'], [role='link']")) {
    return true;
  }
  if (
    target.closest(
      "[role='combobox'], [role='listbox'], [role='menu'], [role='option'], [role='menuitem']"
    )
  ) {
    return true;
  }
  const writing =
    target.isContentEditable || target.tagName.toUpperCase() === "TEXTAREA";
  return writing && !mod;
}

/** Compose into a dialog popup's `onKeyDown`. */
export function handleDialogEnter(event: KeyboardEvent<HTMLElement>): void {
  if (event.key !== "Enter" || event.defaultPrevented) return;
  if (event.nativeEvent.isComposing || event.shiftKey || event.altKey) return;
  const mod = event.metaKey || event.ctrlKey;
  const { target } = event;
  if (!(target instanceof HTMLElement)) return;
  if (targetOwnsEnter(target, mod)) return;
  const action = findDialogDefaultAction(event.currentTarget);
  if (!action) return;
  event.preventDefault();
  action.click();
}

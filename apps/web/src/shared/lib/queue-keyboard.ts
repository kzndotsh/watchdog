import { useEffect, type RefObject } from "react";

import { isEditableTarget } from "@/shared/lib/hotkeys";

/**
 * Queue keyboard flow: `j` / `k` (anywhere outside editable fields) and
 * ArrowDown / ArrowUp (while focus is inside the queue) move the selection.
 * DOM-driven: rows are `[data-slot=queue-row]` in document order and the
 * selection is committed by clicking the row, so every queue keeps its own
 * `onSelect` → URL wiring. Only the most recently mounted queue listens.
 */

const QUEUE_ROW_SELECTOR = '[data-slot="queue-row"]';

export type QueueStep = 1 | -1;

/** Pure: index of the row to select next (clamped; first row when none selected). */
export function nextQueueIndex(
  count: number,
  selected: number,
  step: QueueStep
): number | null {
  if (count === 0) return null;
  if (selected < 0) return step === 1 ? 0 : count - 1;
  const next = selected + step;
  if (next < 0 || next >= count) return null;
  return next;
}

/** Pure: map a keydown to a queue step, or null when it isn't a queue key. */
export function queueStepForKey(
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey"> & {
    target: unknown;
  },
  focusInQueue: boolean
): QueueStep | null {
  if (event.metaKey || event.ctrlKey || event.altKey) return null;
  if (isEditableTarget(event.target)) return null;
  if (event.key === "j") return 1;
  if (event.key === "k") return -1;
  if (!focusInQueue) return null;
  if (event.key === "ArrowDown") return 1;
  if (event.key === "ArrowUp") return -1;
  return null;
}

/** Stack of mounted queues — the top one owns the keys. */
const activeQueues: RefObject<HTMLElement | null>[] = [];

function isTopQueue(ref: RefObject<HTMLElement | null>): boolean {
  return activeQueues.at(-1) === ref;
}

function moveSelection(container: HTMLElement, step: QueueStep): boolean {
  const rows = [...container.querySelectorAll<HTMLElement>(QUEUE_ROW_SELECTOR)];
  const selected = rows.findIndex((row) => row.dataset.selected !== undefined);
  const index = nextQueueIndex(rows.length, selected, step);
  if (index === null) return false;
  const target = rows[index];
  if (!target) return false;
  const hadFocus = container.contains(document.activeElement);
  target.click();
  target.scrollIntoView({ block: "nearest" });
  if (hadFocus) target.focus({ preventScroll: true });
  return true;
}

function attachQueueKeyboard(ref: RefObject<HTMLElement | null>): () => void {
  activeQueues.push(ref);

  function onKeyDown(event: KeyboardEvent) {
    if (event.defaultPrevented || !isTopQueue(ref)) return;
    const container = ref.current;
    if (!container) return;
    const focusInQueue = container.contains(document.activeElement);
    const step = queueStepForKey(event, focusInQueue);
    if (step === null) return;
    if (moveSelection(container, step)) event.preventDefault();
  }

  window.addEventListener("keydown", onKeyDown);
  return () => {
    window.removeEventListener("keydown", onKeyDown);
    const i = activeQueues.lastIndexOf(ref);
    if (i !== -1) activeQueues.splice(i, 1);
  };
}

/** Wire j/k + arrows to the queue under `ref` (no-op when `enabled` is false). */
export function useQueueKeyboard(
  ref: RefObject<HTMLElement | null>,
  enabled = true
): void {
  useEffect(
    () => (enabled ? attachQueueKeyboard(ref) : undefined),
    [ref, enabled]
  );
}

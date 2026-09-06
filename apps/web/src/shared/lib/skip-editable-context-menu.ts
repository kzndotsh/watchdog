import type { MouseEvent as ReactMouseEvent } from "react";

import { isEditableTarget } from "@/shared/lib/hotkeys";

/**
 * Capture-phase skip: Base UI's Trigger always `stopEvent`s on bubble unless
 * Root was already disabled — too late for a React `disabled` flip.
 */
export function skipEditableContextMenu(
  event: ReactMouseEvent | MouseEvent
): void {
  if (isEditableTarget(event.target)) {
    event.stopPropagation();
  }
}

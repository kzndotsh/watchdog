import { useEffect, type RefObject } from "react";

import { attachQueueKeyboard } from "@/shared/lib/queue-keyboard";

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

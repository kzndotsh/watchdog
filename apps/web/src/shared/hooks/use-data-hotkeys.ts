import { useEffect } from "react";

import { findHotkeyTarget } from "@/shared/lib/data-hotkey";
import { isEditableTarget } from "@/shared/lib/hotkeys";

/**
 * Declarative single-key shortcuts: any enabled control rendered with
 * `data-hotkey="a"` is clicked when that bare key is pressed outside an
 * editable field. The control keeps owning its disabled / loading state, so a
 * gated Accept stays gated from the keyboard too. Controls under `inert` or
 * `aria-hidden` (behind a modal) are skipped.
 *
 * Mount once in the shell.
 */
export function useDataHotkeys(): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.length !== 1 || isEditableTarget(event.target)) return;
      const target = findHotkeyTarget(document, event.key);
      if (!target) return;
      event.preventDefault();
      target.click();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);
}

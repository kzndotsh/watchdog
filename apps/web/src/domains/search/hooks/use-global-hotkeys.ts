import { useEffect, useRef } from "react";

import { createHotkeyListener, type HotkeyBinding } from "@/shared/lib/hotkeys";

function attachGlobalHotkeyListener(
  getBindings: () => readonly HotkeyBinding[]
): () => void {
  const onKeyDown = createHotkeyListener(getBindings);
  window.addEventListener("keydown", onKeyDown);
  return () => {
    window.removeEventListener("keydown", onKeyDown);
  };
}

/** Single window keydown listener for the given bindings. */
export function useGlobalHotkeys(bindings: readonly HotkeyBinding[]): void {
  const bindingsRef = useRef(bindings);

  useEffect(() => {
    bindingsRef.current = bindings;
  }, [bindings]);

  useEffect(() => attachGlobalHotkeyListener(() => bindingsRef.current), []);
}

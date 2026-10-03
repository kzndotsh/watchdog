import { useSyncExternalStore } from "react";

import { modKeyLabel } from "@/shared/lib/hotkeys";

function subscribe() {
  // The platform never changes during a session — nothing to subscribe to.
  return () => {
    /* empty */
  };
}

/** Matches the server render so hydration is stable; the glyph applies after mount. */
function getServerSnapshot() {
  return "Ctrl";
}

/** Mod key label (⌘ on Apple, Ctrl elsewhere), safe to render during SSR + hydration. */
export function useModKeyLabel(): string {
  return useSyncExternalStore(subscribe, modKeyLabel, getServerSnapshot);
}

import { modKeyLabel } from "@/shared/lib/hotkeys";

/** Mod key label (⌘ on Apple, Ctrl elsewhere). The app renders on the client only (SSR is off). */
export function useModKeyLabel(): string {
  return modKeyLabel();
}

import { useSyncExternalStore } from "react";

import type { AppAction } from "@/shared/lib/app-action";
import {
  getPaletteCommandsSnapshot,
  getServerPaletteCommandsSnapshot,
  subscribePaletteCommands,
} from "@/shared/lib/palette-commands-store";

/** Commands registered by mounted surfaces (palette surface only). */
export function useRegisteredPaletteCommands(): readonly AppAction[] {
  return useSyncExternalStore(
    subscribePaletteCommands,
    getPaletteCommandsSnapshot,
    getServerPaletteCommandsSnapshot
  );
}

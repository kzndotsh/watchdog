import {
  filterActionsForSurface,
  type AppAction,
} from "@/shared/lib/app-action";

/**
 * Framework-free registry of page-scoped palette commands. Sources, the
 * listener set and the snapshot stay private; callers register a source and
 * get its unregister function back. Shaped for `useSyncExternalStore`.
 */

type Listener = () => void;

const sources = new Map<string, readonly AppAction[]>();
const listeners = new Set<Listener>();
const EMPTY: readonly AppAction[] = [];
let snapshot: readonly AppAction[] = EMPTY;

function emit() {
  snapshot = filterActionsForSurface([...sources.values()].flat(), "palette");
  for (const listener of listeners) listener();
}

export function subscribePaletteCommands(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Palette-surface commands from all registered sources; identity changes only on emit. */
export function getPaletteCommandsSnapshot(): readonly AppAction[] {
  return snapshot;
}

export function getServerPaletteCommandsSnapshot(): readonly AppAction[] {
  return EMPTY;
}

/** Register (or replace) the actions for `sourceId`; returns its unregister function. */
export function registerPaletteSource(
  sourceId: string,
  actions: readonly AppAction[]
): () => void {
  sources.set(sourceId, actions);
  emit();
  return () => {
    sources.delete(sourceId);
    emit();
  };
}

/** Test seam: drop every registration. */
export function resetPaletteCommands(): void {
  sources.clear();
  emit();
}

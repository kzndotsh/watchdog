import { useEffect, useId, useRef, useSyncExternalStore } from "react";

import {
  filterActionsForSurface,
  type AppAction,
} from "@/shared/lib/app-action";

/**
 * Page-scoped palette commands. A mounted surface registers its `page`
 * AppActions with `usePaletteCommands`; they show in Mod+K while it is
 * mounted and disappear on unmount. Registration runs in effects (client
 * only), so server renders never see page commands.
 */

type Listener = () => void;

const sources = new Map<string, readonly AppAction[]>();
const listeners = new Set<Listener>();
let snapshot: readonly AppAction[] = [];

function emit() {
  snapshot = filterActionsForSurface([...sources.values()].flat(), "palette");
  for (const listener of listeners) listener();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): readonly AppAction[] {
  return snapshot;
}

const EMPTY: readonly AppAction[] = [];

function getServerSnapshot(): readonly AppAction[] {
  return EMPTY;
}

/** Test seam: drop every registration. */
export function resetPaletteCommands(): void {
  sources.clear();
  emit();
}

/**
 * Register `actions` in the palette while the caller is mounted. Pass a
 * memoized array; `run` always reads the latest closure via a ref.
 */
export function usePaletteCommands(actions: readonly AppAction[]): void {
  const sourceId = useId();
  const latest = useRef(actions);

  useEffect(() => {
    latest.current = actions;
  }, [actions]);

  // Re-register only when the visible shape changes, not on every closure.
  const shapeKey = actions
    .map((a) =>
      JSON.stringify([
        a.id,
        a.label,
        a.disabled === true,
        a.group,
        a.icon?.displayName ?? a.icon?.name,
        a.shortcut,
        a.keywords,
        a.surfaces,
      ])
    )
    .join("|");

  useEffect(() => {
    sources.set(
      sourceId,
      latest.current.map((action) => ({
        ...action,
        run: () => {
          latest.current.find((a) => a.id === action.id)?.run();
        },
      }))
    );
    emit();
    return () => {
      sources.delete(sourceId);
      emit();
    };
  }, [sourceId, shapeKey]);
}

/** Commands registered by mounted surfaces (palette surface only). */
export function useRegisteredPaletteCommands(): readonly AppAction[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

import {
  lazy,
  Suspense,
  useEffect,
  useState,
  type ComponentType,
  createElement,
  type JSX,
} from "react";

import {
  OVERLAY_PREFETCH_MS,
  prefetchImport,
} from "@/shared/lib/preload-import";

type PrefetchOption = {
  /** Fetch the chunk `OVERLAY_PREFETCH_MS` after the first mount, not only at the first open. */
  readonly shouldPrefetch?: boolean;
};

/** Fetches `load` once, `OVERLAY_PREFETCH_MS` after it mounts. */
function PrefetchOnMount({ load }: { load: () => Promise<unknown> }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      void prefetchImport(load);
    }, OVERLAY_PREFETCH_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [load]);
  return null;
}

/**
 * A dialog or drawer behind a lazy boundary. Its chunk loads at the first open (and, with
 * `shouldPrefetch`, shortly after mount; `load` is a `memoizeImport` loader so a hover or focus
 * handler can warm it too). It mounts on the first open and stays mounted, so a close keeps
 * its exit animation and state. Same props as the component `pick` selects.
 */
export function lazyOverlay<M, P extends { open: boolean }>(
  load: () => Promise<M>,
  pick: (module: M) => ComponentType<P>,
  options?: PrefetchOption
): (props: P) => JSX.Element | null;
/** For an overlay with no `open` prop: `isOpen` says when the first mount happens. */
export function lazyOverlay<M, P extends object>(
  load: () => Promise<M>,
  pick: (module: M) => ComponentType<P>,
  options: PrefetchOption & { readonly isOpen: (props: P) => boolean }
): (props: P) => JSX.Element | null;
export function lazyOverlay<M, P extends object>(
  load: () => Promise<M>,
  pick: (module: M) => ComponentType<P>,
  options: PrefetchOption & { readonly isOpen?: (props: P) => boolean } = {}
): (props: P) => JSX.Element | null {
  const { shouldPrefetch = false, isOpen } = options;
  const Loaded = lazy(async () => ({ default: pick(await load()) }));

  return function LazyOverlay(props: P) {
    const [isMounted, setIsMounted] = useState(false);
    const isShown =
      isOpen?.(props) ?? (props as { open?: boolean }).open === true;
    if (isShown && !isMounted) setIsMounted(true);

    if (!isMounted) {
      return shouldPrefetch ? createElement(PrefetchOnMount, { load }) : null;
    }
    return createElement(
      Suspense,
      { fallback: null },
      createElement(Loaded, props)
    );
  };
}

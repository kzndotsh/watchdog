import { Suspense, type ReactNode } from "react";

import { stackPendingFallback } from "@/shared/ui/stack-pending-fallback";

export { stackPendingFallback };

/**
 * Gate for stack / Detail tab panels: inactive → null; pending → skeleton;
 * else children. Prefer conditional unmount over React Activity for heavy
 * canvases (ego-graph, task board).
 */
export function ActiveTabBody({
  active,
  pending = false,
  pendingSections,
  children,
}: {
  active: boolean;
  pending?: boolean;
  pendingSections?: number;
  children: ReactNode;
}): ReactNode {
  if (!active) return null;
  if (pending) {
    return stackPendingFallback(pendingSections);
  }
  return children;
}

/** Suspense wrapper with StackBodySkeleton — use inside ActiveTabBody. */
export function SuspenseTabBody({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return (
    <Suspense fallback={fallback ?? stackPendingFallback()}>
      {children}
    </Suspense>
  );
}

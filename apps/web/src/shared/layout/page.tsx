import { type ReactNode, useEffect } from "react";

import { cn } from "@/lib/utils";

export type PageDensity = "default" | "split";

/**
 * Standard page frame.
 * pt-0 so PageHeader sits flush at the top of the inset (no gap above it).
 * Side + bottom padding kept for content breathing room.
 */
export function Page({
  children,
  className,
  density = "default",
}: {
  children: ReactNode;
  className?: string;
  density?: PageDensity;
}) {
  // Route content is interactive once the page frame has committed: the root
  // `html[data-hydrated]` only says the providers mounted, before the lazy route.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.pageHydrated = "true";
    return () => {
      delete root.dataset.pageHydrated;
    };
  }, []);

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-3 px-3 pt-0 pb-3 sm:px-4 sm:pt-0 sm:pb-4",
        density === "default" && "overflow-y-auto",
        density === "split" && "max-w-none overflow-hidden",
        className
      )}
    >
      {children}
    </div>
  );
}

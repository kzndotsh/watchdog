import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Field / form inline warning. */
export function FormInlineWarning({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  if (children === null || children === undefined || children === "") {
    return null;
  }
  return (
    <p className={cn("text-warning text-xs", className)} role="status">
      {children}
    </p>
  );
}

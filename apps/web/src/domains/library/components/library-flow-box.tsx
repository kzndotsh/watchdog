import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { LIBRARY_ENTRY_BOX_CLASS } from "@/shared/ui/library-shell";

export type LibraryFlowBoxProps = {
  label: string;
  children: ReactNode;
  className?: string;
};

/** One box of a How it works / How it runs flow: a muted label over its content. */
export function LibraryFlowBox({
  label,
  children,
  className,
}: LibraryFlowBoxProps) {
  return (
    <div className={cn(LIBRARY_ENTRY_BOX_CLASS, className)}>
      <span className="text-muted-foreground text-xs">{label}</span>
      <div>{children}</div>
    </div>
  );
}

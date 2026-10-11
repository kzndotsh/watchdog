import type { ReactNode } from "react";

export function DashedEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="border-border/60 text-muted-foreground flex min-h-24 items-center justify-center rounded-lg border border-dashed px-3 py-6 text-center text-xs">
      {children}
    </div>
  );
}

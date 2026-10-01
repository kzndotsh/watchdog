import type { ElementType, ReactNode } from "react";

import { cn } from "@/lib/utils";

const BASE =
  "text-2xs font-medium text-muted-foreground normal-case tracking-normal";

interface SectionLabelProps {
  children: ReactNode;
  className?: string;
  /** Dense dossier rails (slightly smaller). */
  density?: "default" | "compact";
  as?: ElementType;
}

export function SectionLabel({
  children,
  className,
  density = "default",
  as: Comp = "h2",
}: SectionLabelProps) {
  return (
    <Comp
      className={cn(
        BASE,
        density === "compact" && "text-xs leading-tight font-medium",
        className
      )}
    >
      {children}
    </Comp>
  );
}

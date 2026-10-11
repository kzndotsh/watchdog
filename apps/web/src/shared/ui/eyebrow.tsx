import type { ElementType, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The uppercase tracked label (`text-xs tracking-wider uppercase`). For a component that
 * only takes a `className` (a Chip, a Badge); everywhere else render `Eyebrow`.
 */
export const EYEBROW_CLASS = "text-xs tracking-wider uppercase";

const TONE = {
  muted: "text-muted-foreground",
  foreground: "text-foreground",
  /** Ink comes from the parent or from `className` (a status chip). */
  inherit: "",
} as const;

type EyebrowProps = {
  children: ReactNode;
  className?: string;
  tone?: keyof typeof TONE;
  title?: string;
  as?: ElementType;
};

/**
 * Small uppercase label for a kind, an action or a hint: "FACT", "⌘↵ TO SAVE". Not a
 * heading (`SectionLabel`) and not the large page kicker (`tracking-eyebrow`).
 */
export function Eyebrow({
  children,
  className,
  tone = "muted",
  title,
  as: Comp = "span",
}: EyebrowProps) {
  return (
    <Comp className={cn(EYEBROW_CLASS, TONE[tone], className)} title={title}>
      {children}
    </Comp>
  );
}

import { cn } from "@/lib/utils";

/** Compact count pill for tab labels and PageHeader last-crumb totals. */
export function TabCount({ n, className }: { n: number; className?: string }) {
  if (n === 0) return null;
  return (
    <span
      data-slot="tab-count"
      className={cn(
        "bg-secondary text-2xs text-secondary-foreground ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-sm px-1 font-mono tabular-nums",
        className
      )}
    >
      {n}
    </span>
  );
}

TabCount.displayName = "TabCount";

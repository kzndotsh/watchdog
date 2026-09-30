// @ts-nocheck — shadcn vendor; excluded from project checks
import { cn } from "@/lib/utils";

function Kbd({
  className,
  tone = "default",
  ...props
}: React.ComponentProps<"kbd"> & { tone?: "default" | "inherit" }) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "bg-muted text-muted-foreground in-data-[slot=tooltip-content]:bg-background/20 in-data-[slot=tooltip-content]:text-background dark:in-data-[slot=tooltip-content]:bg-background/10 pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm px-1 font-sans text-xs font-medium select-none [&_svg:not([class*='size-'])]:size-3",
        // Watchdog: inside a colored control (e.g. a primary Button) borrow its ink.
        tone === "inherit" && "text-current bg-current/15",
        className
      )}
      {...props}
    />
  );
}

function KbdGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <kbd
      data-slot="kbd-group"
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  );
}

export { Kbd, KbdGroup };

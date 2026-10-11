import { cn } from "@/lib/utils";

/** Dot diameters: `sm` 0.5rem (default), `md` 0.625rem (ringed, e.g. an open question). */
const DOT_SIZE = { sm: "size-2", md: "size-2.5" } as const;

/**
 * Dot marker for an item inside a `TimelineSpine`. The item must be `relative` and sit
 * directly in the spine's `pl-4` (1px `border-l`): the one offset assumes both, so a dot
 * whose containing block is anything else lands off the line. Its centre sits on the
 * line whatever its diameter; callers pass only fill / border colour via `className`,
 * never a position.
 */
export function TimelineDot({
  className,
  size = "sm",
}: {
  className?: string;
  size?: keyof typeof DOT_SIZE;
}) {
  return (
    <span
      data-slot="timeline-dot"
      className={cn(
        "ring-background absolute top-1.5 -left-[calc(1rem+0.5px)] -translate-x-1/2 rounded-full ring-4",
        DOT_SIZE[size],
        className
      )}
    />
  );
}

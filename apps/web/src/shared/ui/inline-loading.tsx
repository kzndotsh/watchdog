import { cn } from "@/lib/utils";
import { Spinner } from "@watchdog/ui/components/spinner";

/** Inline spinner + label — use inside Queue/Detail regions while fetching. */
export function InlineLoading({
  label = "Loading…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "text-muted-foreground flex items-center gap-2 text-sm",
        className
      )}
      aria-live="polite"
      aria-busy
    >
      <Spinner className="size-4" />
      {label}
    </div>
  );
}

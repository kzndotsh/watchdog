import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/shared/ui/relative-time.lib";
import { Timestamp } from "@/shared/ui/timestamp";

type RelativeTimeProps = {
  /** ISO-8601 instant. */
  value: string | null | undefined;
  className?: string;
  /** Fallback when value missing/invalid. */
  empty?: string;
};

/** Compact relative label with full local tooltip via Timestamp. */
export function RelativeTime({
  value,
  className,
  empty = "—",
}: RelativeTimeProps) {
  if (!value) {
    return (
      <span className={cn("text-muted-foreground", className)}>{empty}</span>
    );
  }

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return (
      <span className={cn("text-muted-foreground", className)}>{empty}</span>
    );
  }

  return (
    <Timestamp value={value} className={cn("text-muted-foreground", className)}>
      <span suppressHydrationWarning>{formatRelativeTime(d)}</span>
    </Timestamp>
  );
}

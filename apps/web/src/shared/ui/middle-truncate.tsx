import { cn } from "@/lib/utils";

type MiddleTruncateProps = {
  value: string;
  /** Chars to show at start. Default 8. */
  head?: number;
  /** Chars to show at end. Default 6. */
  tail?: number;
  className?: string;
  hasNativeTitle?: boolean;
};

/**
 * Truncates text in the middle showing head and tail chars.
 * No DOM measurement needed — best for fixed-length strings
 * like UUIDs, hashes, and IDs where you control the context.
 *
 * For truly dynamic widths use CSS end-truncation instead.
 */
export function MiddleTruncate({
  value,
  head = 8,
  tail = 6,
  className,
  /** Native browser title with full value. Default true. */
  hasNativeTitle = true,
}: MiddleTruncateProps) {
  const title = hasNativeTitle ? value : undefined;

  if (value.length <= head + tail + 1) {
    return (
      <span title={title} className={cn("font-mono leading-none", className)}>
        {value}
      </span>
    );
  }

  return (
    <span
      title={title}
      aria-label={value}
      className={cn(
        "inline-flex max-w-full min-w-0 items-center font-mono leading-none",
        className
      )}
    >
      <span className="overflow-hidden text-ellipsis whitespace-nowrap">
        {value.slice(0, head)}
      </span>
      <span className="shrink-0" aria-hidden>
        …
      </span>
      <span className="shrink-0">{value.slice(-tail)}</span>
    </span>
  );
}

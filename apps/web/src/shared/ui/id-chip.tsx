import { CheckIcon, CopyIcon, EyeIcon } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";
import { MiddleTruncate } from "@/shared/ui/middle-truncate";
import { WithTooltip } from "@/shared/ui/timestamp";

type IdChipSize = "sm" | "md";
type IdChipPreset = "default" | "sha256";

const PRESET: Record<IdChipPreset, { head: number; tail: number }> = {
  default: { head: 8, tail: 6 },
  sha256: { head: 10, tail: 8 },
};

const VALUE_TOOLTIP_CLASS =
  "max-w-[12rem] break-all px-2 py-1 font-mono text-[10px] leading-snug";

interface IdChipProps {
  value: string;
  /** Visible label when it differs from the opaque `value` (tooltip still shows `value`). */
  display?: string;
  /** When true, the whole chip copies the full value. */
  copyable?: boolean;
  onCopied?: (value: string) => void;
  /**
   * Preview affordance — whole chip activates `onPreview`.
   * Mutually exclusive with `copyable`. Prefer `ClickableIdChip`.
   */
  onPreview?: (value: string) => void;
  /** Show the entire value (no middle-truncate). Prefer in Detail headers. */
  full?: boolean;
  preset?: IdChipPreset;
  head?: number;
  tail?: number;
  size?: IdChipSize;
  className?: string;
}

/**
 * Opaque id / hash display — middle-truncate mono chip (or full when `full`).
 * Not a Badge. Domains must not freestyle `.slice(0, N)`.
 *
 * Truncated: full value always via DS tooltip (never native `title`).
 * Copyable: tip swaps to “Copied” briefly after click.
 */
export function IdChip({
  value,
  display,
  copyable = false,
  onCopied,
  onPreview,
  full = false,
  preset = "default",
  head,
  tail,
  size = "sm",
  className,
}: IdChipProps) {
  const [copied, setCopied] = useState(false);
  const dims = PRESET[preset];
  const h = head ?? dims.head;
  const t = tail ?? dims.tail;
  const preview = onPreview !== undefined;
  const interactive = copyable || preview;
  const shown = display?.trim() ? display.trim() : value;

  const chrome = cn(
    "border-border/60 bg-muted/60 inline-flex w-fit max-w-full min-w-0 gap-1 rounded-md border pl-1.5 [font-variant-ligatures:none]",
    full ? "h-auto min-h-5 items-start py-0.5" : "items-center",
    size === "sm" ? "text-label-mono-sm" : "text-label-mono",
    !full && (size === "sm" ? "h-5" : "h-6"),
    interactive ? "pr-1" : "pr-1.5",
    interactive &&
      "hover:bg-muted focus-visible:ring-ring/50 text-left transition-colors outline-none focus-visible:ring-2",
    className
  );

  const label = full ? (
    <span
      className={cn(
        "text-muted-foreground leading-none break-all",
        shown === value ? "font-mono" : undefined
      )}
    >
      {shown}
    </span>
  ) : (
    <MiddleTruncate
      value={shown}
      head={h}
      tail={t}
      nativeTitle={false}
      className={cn(
        "text-muted-foreground min-w-0 leading-none",
        shown === value ? undefined : "font-sans"
      )}
    />
  );

  async function handleCopy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      onCopied?.(value);
      window.setTimeout(() => {
        setCopied(false);
      }, 1200);
    } catch {
      // Parent may surface failure via onCopied absence + own handling.
    }
  }

  if (copyable) {
    let tip: string | false = value;
    if (full) tip = false;
    if (copied) tip = "Copied";
    return (
      <WithTooltip
        content={tip}
        wrapSpan
        delay={copied ? 0 : 700}
        className="inline-flex max-w-full"
        contentClassName={copied || full ? undefined : VALUE_TOOLTIP_CLASS}
      >
        <button
          type="button"
          data-slot="id-chip"
          aria-label={copied ? "Copied" : "Copy id"}
          className={chrome}
          onClick={() => void handleCopy()}
        >
          {label}
          <span
            className="text-muted-foreground/70 shrink-0 self-center"
            aria-hidden
          >
            {copied ? (
              <CheckIcon className="size-2.5" strokeWidth={2} />
            ) : (
              <CopyIcon className="size-2.5" strokeWidth={2} />
            )}
          </span>
        </button>
      </WithTooltip>
    );
  }

  if (preview) {
    const previewTip =
      shown === value ? "Preview evidence" : `${shown}\n${value}`;
    return (
      <WithTooltip
        content={previewTip}
        wrapSpan
        className="inline-flex max-w-full"
        contentClassName={shown === value ? undefined : VALUE_TOOLTIP_CLASS}
      >
        <button
          type="button"
          data-slot="id-chip"
          aria-label={
            shown === value ? "Preview evidence" : `Preview evidence: ${shown}`
          }
          className={chrome}
          onClick={() => {
            onPreview(value);
          }}
        >
          {label}
          <span className="text-muted-foreground/70 shrink-0" aria-hidden>
            <EyeIcon className="size-2.5" strokeWidth={2} />
          </span>
        </button>
      </WithTooltip>
    );
  }

  return (
    <span data-slot="id-chip" className={chrome}>
      {full ? (
        label
      ) : (
        <WithTooltip
          content={value}
          wrapSpan
          delay={700}
          className="inline-flex min-w-0 items-center"
          contentClassName={VALUE_TOOLTIP_CLASS}
        >
          {label}
        </WithTooltip>
      )}
    </span>
  );
}

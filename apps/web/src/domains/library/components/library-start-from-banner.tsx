import { LibraryBanner } from "@/domains/library/components/library-banner";
import type { InputKindOption } from "@/domains/library/types";
import { cn } from "@/lib/utils";

export type StartFromBannerProps = {
  picks: readonly InputKindOption[];
  /** The input kinds in the URL. */
  selected: readonly string[];
  /** Picks the kind, or drops it when it is already one of `selected`. */
  onPick: (kind: string) => void;
};

/** Quick picks for "start from what you have"; picking a chosen kind again drops it. */
export function LibraryStartFromBanner({
  picks,
  selected,
  onPick,
}: StartFromBannerProps) {
  if (picks.length === 0) return null;
  return (
    <LibraryBanner label="Start from what you have">
      <p className="text-sm font-medium">Start from what you have</p>
      <div className="flex flex-wrap gap-1.5">
        {picks.map((pick) => {
          const isSelected = selected.includes(pick.value);
          return (
            <button
              key={pick.value}
              type="button"
              aria-pressed={isSelected}
              onClick={() => {
                onPick(pick.value);
              }}
              className={cn(
                "border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 focus-visible:ring-ring/40 h-7 rounded-md border px-2.5 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none",
                isSelected && "bg-muted text-foreground"
              )}
            >
              {pick.label}
            </button>
          );
        })}
      </div>
    </LibraryBanner>
  );
}

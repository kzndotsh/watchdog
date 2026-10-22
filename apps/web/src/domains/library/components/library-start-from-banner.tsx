import { LibraryBanner } from "@/domains/library/components/library-banner";
import type { InputKindOption } from "@/domains/library/types";
import { cn } from "@/lib/utils";

export type StartFromBannerProps = {
  picks: readonly InputKindOption[];
  /** The input kind in the URL, or null. */
  selected: string | null;
  onPick: (kind: string | null) => void;
};

/** Quick picks for "start from what you have"; picking the chosen kind again clears it. */
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
          const isSelected = pick.value === selected;
          return (
            <button
              key={pick.value}
              type="button"
              aria-pressed={isSelected}
              onClick={() => {
                onPick(isSelected ? null : pick.value);
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

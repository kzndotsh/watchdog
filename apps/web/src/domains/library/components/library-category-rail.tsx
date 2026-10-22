import type { LibraryCategory } from "@/domains/library/lib/library-entries";
import { cn } from "@/lib/utils";
import {
  LIBRARY_RAIL_ITEM_CLASS,
  LIBRARY_RAIL_LIST_CLASS,
  LIBRARY_RAIL_NAV_CLASS,
} from "@/shared/ui/library-shell";

/** Key of the total in `LibraryCategoryRailProps.counts`. */
export const ALL_CATEGORIES = "all";

export type LibraryCategoryRailProps = {
  categories: readonly LibraryCategory[];
  /** Entries per category under the current filters; `ALL_CATEGORIES` is the total. */
  counts: ReadonlyMap<string, number>;
  /** The selected category id, or null for All. */
  selected: string | null;
  onSelect: (category: string | null) => void;
};

type RailItemProps = {
  label: string;
  count: number;
  isSelected: boolean;
  onClick: () => void;
};

function RailItem({ label, count, isSelected, onClick }: RailItemProps) {
  return (
    <li className="shrink-0">
      <button
        type="button"
        aria-current={isSelected ? "true" : undefined}
        onClick={onClick}
        className={cn(
          LIBRARY_RAIL_ITEM_CLASS,
          isSelected && "bg-muted text-foreground"
        )}
      >
        <span>{label}</span>
        <span className="text-2xs tabular-nums">{count}</span>
      </button>
    </li>
  );
}

/**
 * Categories as a narrow sidebar on desktop and a horizontal scroller at phone width. The
 * counts follow the other filters, so the rail and the filters read as one.
 */
export function LibraryCategoryRail({
  categories,
  counts,
  selected,
  onSelect,
}: LibraryCategoryRailProps) {
  return (
    <nav aria-label="Library categories" className={LIBRARY_RAIL_NAV_CLASS}>
      <ul className={LIBRARY_RAIL_LIST_CLASS}>
        <RailItem
          label="All"
          count={counts.get(ALL_CATEGORIES) ?? 0}
          isSelected={selected === null}
          onClick={() => {
            onSelect(null);
          }}
        />
        {categories.map((category) => (
          <RailItem
            key={category.id}
            label={category.label}
            count={counts.get(category.id) ?? 0}
            isSelected={selected === category.id}
            onClick={() => {
              onSelect(category.id);
            }}
          />
        ))}
      </ul>
    </nav>
  );
}

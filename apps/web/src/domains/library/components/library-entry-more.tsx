import { LibraryCard } from "@/domains/library/components/library-card";
import { LibraryEntrySection } from "@/domains/library/components/library-entry-section";
import { useLibraryData } from "@/domains/library/hooks/use-library-data";
import { relatedEntries } from "@/domains/library/lib/library-entries";
import type { LibraryEntry } from "@/domains/library/types";
import { LIBRARY_CARD_GRID_CLASS } from "@/shared/ui/library-shell";

export type LibraryEntryMoreProps = {
  entry: LibraryEntry;
};

/** Up to three other entries from the entry's category as real cards; hidden when there are none. */
export function LibraryEntryMore({ entry }: LibraryEntryMoreProps) {
  const { entries } = useLibraryData();
  const related = relatedEntries(entries, entry);
  if (related.length === 0) return null;
  return (
    <LibraryEntrySection title={`More in ${entry.categoryLabel}`}>
      <ul className={LIBRARY_CARD_GRID_CLASS}>
        {related.map((other) => (
          <li key={other.key} className="flex">
            <LibraryCard entry={other} />
          </li>
        ))}
      </ul>
    </LibraryEntrySection>
  );
}

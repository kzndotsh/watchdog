import { LibraryCard } from "@/domains/library/components/library-card";
import type { LibraryGroup } from "@/domains/library/types";
import {
  LIBRARY_CARD_GRID_CLASS,
  LIBRARY_GROUP_HEADING_CLASS,
} from "@/shared/ui/library-shell";

function CardGrid({ group }: { group: LibraryGroup }) {
  return (
    <ul className={LIBRARY_CARD_GRID_CLASS}>
      {group.entries.map((entry) => (
        <li key={entry.key}>
          <LibraryCard entry={entry} />
        </li>
      ))}
    </ul>
  );
}

export type LibraryGridProps = {
  /** One titled section per category; a single category is one section, so nothing shifts. */
  groups: readonly LibraryGroup[];
};

export function LibraryGrid({ groups }: LibraryGridProps) {
  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <section key={group.id} aria-labelledby={`library-group-${group.id}`}>
          <h3
            id={`library-group-${group.id}`}
            className={LIBRARY_GROUP_HEADING_CLASS}
          >
            {group.label}
            <span aria-hidden className="px-1.5">
              ·
            </span>
            <span className="tabular-nums">{group.entries.length}</span>
          </h3>
          <CardGrid group={group} />
        </section>
      ))}
    </div>
  );
}

import { Link } from "@tanstack/react-router";

import { LibraryEgressMark } from "@/domains/library/components/library-egress-mark";
import { LibraryKindChip } from "@/domains/library/components/library-kind-chip";
import { LibraryKindTile } from "@/domains/library/components/library-kind-tile";
import { LibraryRunOn } from "@/domains/library/components/library-run-on";
import type { LibraryEntry } from "@/domains/library/types";

export type LibraryEntryHeaderProps = {
  entry: LibraryEntry;
};

/** Back link, kind tile with category eyebrow, title and chips; Run on… at the right (below on mobile). */
export function LibraryEntryHeader({ entry }: LibraryEntryHeaderProps) {
  return (
    <header className="flex flex-col gap-6">
      <Link
        to="/library"
        search={{ id: undefined }}
        className="text-muted-foreground hover:text-foreground w-fit text-xs"
      >
        ← Library
      </Link>
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <LibraryKindTile kinds={entry.inputKinds} />
          <div className="flex min-w-0 flex-col gap-1.5">
            <p className="text-muted-foreground text-xs tracking-widest uppercase">
              {entry.categoryLabel}
            </p>
            <h1 className="text-2xl font-medium tracking-tight text-balance">
              {entry.title}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <LibraryKindChip kind={entry.kind} />
              {entry.isThirdParty ? <LibraryEgressMark /> : null}
            </div>
          </div>
        </div>
        <div className="shrink-0">
          <LibraryRunOn entry={entry} />
        </div>
      </div>
    </header>
  );
}

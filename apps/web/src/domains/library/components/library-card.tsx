import { Link } from "@tanstack/react-router";

import { LibraryEgressMark } from "@/domains/library/components/library-egress-mark";
import { LibraryKindChip } from "@/domains/library/components/library-kind-chip";
import { LibraryKindTile } from "@/domains/library/components/library-kind-tile";
import { LibraryReadinessBadge } from "@/domains/library/components/library-readiness-badge";
import type { LibraryEntry } from "@/domains/library/types";
import { LIBRARY_CARD_CLASS } from "@/shared/ui/library-shell";

function CardBody({
  entry,
  isCompact,
}: {
  entry: LibraryEntry;
  isCompact: boolean;
}) {
  return (
    <>
      <div className="flex items-center gap-2.5">
        <LibraryKindTile kinds={entry.inputKinds} />
        <p className="min-w-0 truncate text-sm leading-tight font-medium">
          {entry.title}
        </p>
      </div>
      {isCompact ? null : (
        <p className="text-muted-foreground min-w-0 text-xs leading-snug">
          {entry.description === "" ? "No description" : entry.description}
        </p>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-1.5">
        <LibraryKindChip kind={entry.kind} />
        {entry.isThirdParty ? <LibraryEgressMark /> : null}
        {entry.readiness.state === "ready" ? null : (
          <LibraryReadinessBadge readiness={entry.readiness} />
        )}
      </div>
    </>
  );
}

/** One Cap or Playbook as a card; the whole card is the link to its page. */
export function LibraryCard({
  entry,
  isCompact = false,
}: {
  entry: LibraryEntry;
  isCompact?: boolean;
}) {
  if (entry.kind === "cap") {
    return (
      <Link
        to="/library/caps/$capId"
        params={{ capId: entry.id }}
        className={LIBRARY_CARD_CLASS}
      >
        <CardBody entry={entry} isCompact={isCompact} />
      </Link>
    );
  }
  return (
    <Link
      to="/library/playbooks/$playbookId"
      params={{ playbookId: entry.id }}
      className={LIBRARY_CARD_CLASS}
    >
      <CardBody entry={entry} isCompact={isCompact} />
    </Link>
  );
}

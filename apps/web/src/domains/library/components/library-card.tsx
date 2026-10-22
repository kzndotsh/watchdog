import { Link } from "@tanstack/react-router";

import { LibraryEgressMark } from "@/domains/library/components/library-egress-mark";
import { LibraryReadinessBadge } from "@/domains/library/components/library-readiness-badge";
import type { LibraryEntry } from "@/domains/library/types";
import { cn } from "@/lib/utils";
import { CASE_CARD_SHELL_CLASS } from "@/shared/ui/case-card-shell";
import { Chip } from "@/shared/ui/chip";

const CARD_CLASS = cn(
  CASE_CARD_SHELL_CLASS,
  "focus-visible:ring-ring/40 flex h-full min-h-44 flex-col gap-2 p-4 focus-visible:ring-2 focus-visible:outline-none"
);

function CardBody({ entry }: { entry: LibraryEntry }) {
  return (
    <>
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden
          className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-md text-sm font-medium uppercase"
        >
          {entry.title.charAt(0)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm leading-tight font-medium">
            {entry.title}
          </p>
          <p className="text-muted-foreground truncate text-xs">
            {entry.providers.join(", ") || entry.id}
          </p>
        </div>
      </div>
      <p className="text-muted-foreground line-clamp-2 min-w-0 text-xs leading-snug">
        {entry.description === "" ? "No description" : entry.description}
      </p>
      <div className="mt-auto flex flex-wrap items-center gap-1.5">
        <Chip size="sm">{entry.kind === "cap" ? "Cap" : "Playbook"}</Chip>
        {entry.isThirdParty ? <LibraryEgressMark /> : null}
        <LibraryReadinessBadge readiness={entry.readiness} />
      </div>
    </>
  );
}

/** One Cap or Playbook as a card; the whole card is the link to its page. */
export function LibraryCard({ entry }: { entry: LibraryEntry }) {
  if (entry.kind === "cap") {
    return (
      <Link
        to="/library/caps/$capId"
        params={{ capId: entry.id }}
        className={CARD_CLASS}
      >
        <CardBody entry={entry} />
      </Link>
    );
  }
  // The Playbook page's route lands separately, so its link is a plain anchor for now.
  return (
    <a
      href={`/library/playbooks/${encodeURIComponent(entry.id)}`}
      className={CARD_CLASS}
    >
      <CardBody entry={entry} />
    </a>
  );
}

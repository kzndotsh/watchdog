import { Link } from "@tanstack/react-router";
import { ArrowRightIcon } from "lucide-react";
import type { ReactNode } from "react";

import { LibraryEntryMeta } from "@/domains/library/components/library-entry-meta";
import { LibraryReadinessBadge } from "@/domains/library/components/library-readiness-badge";
import type { LibraryEntry } from "@/domains/library/types";

export type LibraryReadinessNoteProps = {
  entry: Pick<LibraryEntry, "kind" | "readiness">;
  /** A line under the badge, such as a Playbook's step roll-up. */
  detail?: ReactNode;
};

/** What is missing, as a list: one key per line, "one of" when any of them will do. */
function MissingKeys({ slots }: { slots: readonly string[] }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs">
        {slots.length === 1 ? "Needs" : "Needs one of"}
      </span>
      <ul className="flex flex-col gap-0.5 font-mono text-xs">
        {slots.map((slot) => (
          <li key={slot} className="break-all">
            {slot}
          </li>
        ))}
      </ul>
      <Link
        to="/settings"
        search={{ tab: "credentials" }}
        className="text-primary inline-flex w-fit items-center gap-1 hover:underline"
      >
        Add a key in Settings
        <ArrowRightIcon aria-hidden className="size-3.5" />
      </Link>
    </div>
  );
}

/**
 * The aside's Status block when an entry cannot run: the readiness badge, an optional detail
 * line, then what to do about it (the missing keys and a Settings link, or the reason).
 */
export function LibraryReadinessNote({
  entry,
  detail,
}: LibraryReadinessNoteProps) {
  const { readiness } = entry;
  if (readiness.state === "ready" && detail === undefined) return null;
  return (
    <LibraryEntryMeta label="Status">
      <div className="flex flex-col gap-2">
        <div className="w-fit">
          <LibraryReadinessBadge readiness={readiness} />
        </div>
        {detail === undefined ? null : (
          <p className="text-muted-foreground">{detail}</p>
        )}
        {readiness.state === "needs_key" ? (
          <MissingKeys slots={readiness.slots} />
        ) : null}
        {readiness.state === "off_by_operator" ? (
          <p className="text-muted-foreground">
            An operator has turned breach Caps off on this server.
          </p>
        ) : null}
        {readiness.state === "unavailable" ? (
          <p className="text-muted-foreground">{readiness.reason}.</p>
        ) : null}
      </div>
    </LibraryEntryMeta>
  );
}

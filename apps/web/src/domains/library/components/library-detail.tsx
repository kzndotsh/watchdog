import { Link } from "@tanstack/react-router";

import { LibraryEgressMark } from "@/domains/library/components/library-egress-mark";
import { LibraryReadinessBadge } from "@/domains/library/components/library-readiness-badge";
import type { LibraryEntry } from "@/domains/library/types";
import { DetailContextHeader } from "@/shared/ui/detail-context-header";
import { DetailEmpty } from "@/shared/ui/detail-empty";
import { MetaGrid } from "@/shared/ui/meta-grid";
import { MetaGridItem } from "@/shared/ui/meta-grid-item";

export type LibraryDetailProps = {
  entry: LibraryEntry | null;
};

function ReadinessNote({ entry }: { entry: LibraryEntry }) {
  const { readiness } = entry;
  switch (readiness.state) {
    case "needs_key": {
      return (
        <p className="text-sm">
          Needs {readiness.slots.length === 1 ? "the key" : "one of these keys"}
          : <span className="font-mono">{readiness.slots.join(" | ")}</span>.{" "}
          <Link
            to="/settings"
            search={{ tab: "credentials" }}
            className="underline underline-offset-2"
          >
            Connect it in Settings
          </Link>
        </p>
      );
    }
    case "off_by_operator": {
      return (
        <p className="text-sm">
          An operator has turned breach Caps off on this server, so this{" "}
          {entry.kind === "cap" ? "Cap" : "Playbook"} cannot run.
        </p>
      );
    }
    case "unavailable": {
      return <p className="text-sm">{readiness.reason}.</p>;
    }
    case "ready": {
      return null;
    }
    default: {
      const _exhaustive: never = readiness;
      return _exhaustive;
    }
  }
}

/**
 * Library Detail. Until an entry is picked it explains the Library. A picked entry shows
 * a minimal header; the full Cap and Playbook pages (#463, #464) render in the seam below.
 */
export function LibraryDetail({ entry }: LibraryDetailProps) {
  if (entry === null) {
    return (
      <DetailEmpty
        title="The Library"
        description="Every Cap and Playbook this server can run, whether or not you have a Case open. Start from what you have, such as an email address or a domain, to see what takes it. Ready entries come first. Running always happens in Collect, inside a Case."
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DetailContextHeader>
        <span className="truncate font-medium">{entry.title}</span>
      </DetailContextHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        <div className="flex flex-wrap items-center gap-2">
          <LibraryReadinessBadge readiness={entry.readiness} />
          {entry.isThirdParty ? <LibraryEgressMark /> : null}
        </div>
        <ReadinessNote entry={entry} />
        {entry.description === "" ? null : (
          <p className="text-muted-foreground text-sm">{entry.description}</p>
        )}
        <MetaGrid>
          <MetaGridItem label="Category">{entry.categoryLabel}</MetaGridItem>
          <MetaGridItem
            label={entry.providers.length === 1 ? "Provider" : "Providers"}
          >
            {entry.providers.length === 0 ? "None" : entry.providers.join(", ")}
          </MetaGridItem>
        </MetaGrid>
        {/* Seam: #463 (Cap detail) and #464 (Playbook detail) render their body here, keyed on `entry.kind`. */}
      </div>
    </div>
  );
}

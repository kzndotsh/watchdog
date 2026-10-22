import { LibraryEgressMark } from "@/domains/library/components/library-egress-mark";
import { LibraryReadinessBadge } from "@/domains/library/components/library-readiness-badge";
import type { LibraryGroup } from "@/domains/library/types";
import { QueueDayGroup } from "@/shared/ui/queue-day-group";
import { QueueRow } from "@/shared/ui/queue-row";
import { QueueRowTitle } from "@/shared/ui/queue-row-title";

export type LibraryQueueListProps = {
  groups: readonly LibraryGroup[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
};

/** Caps and Playbooks grouped by category; each row names its readiness and any egress. */
export function LibraryQueueList({
  groups,
  selectedKey,
  onSelect,
}: LibraryQueueListProps) {
  return (
    <div role="listbox" aria-label="Library entries">
      {groups.map((group) => (
        <QueueDayGroup
          key={group.id}
          label={group.label}
          count={group.entries.length}
        >
          {group.entries.map((entry) => (
            <li key={entry.key}>
              <QueueRow
                role="option"
                aria-selected={entry.key === selectedKey}
                isSelected={entry.key === selectedKey}
                className="py-2"
                onClick={() => {
                  onSelect(entry.key);
                }}
                trailing={<LibraryReadinessBadge readiness={entry.readiness} />}
              >
                <div className="flex min-w-0 items-center gap-1.5">
                  <QueueRowTitle>{entry.title}</QueueRowTitle>
                  {entry.isThirdParty ? <LibraryEgressMark /> : null}
                </div>
                <span className="text-foreground/70 truncate text-xs">
                  {entry.providers.join(", ") || entry.id}
                </span>
              </QueueRow>
            </li>
          ))}
        </QueueDayGroup>
      ))}
    </div>
  );
}

import {
  opLabel,
  proposalPatch,
  proposalTitle,
} from "@/domains/triage/lib/filters";
import type { ListDensity } from "@/shared/lib/list/list-display-store";
import { groupItemsByDay } from "@/shared/ui/group-by-day";
import { QueueDayGroup } from "@/shared/ui/queue-day-group";
import { QueueRow } from "@/shared/ui/queue-row";
import { QueueRowInstantMeta } from "@/shared/ui/queue-row-instant-meta";
import { QueueRowTitle } from "@/shared/ui/queue-row-title";
import { StatusDot } from "@/shared/ui/status-dot";
import type { ProposalRecord } from "@watchdog/core/proposals";

type TriageQueueListProps = {
  proposals: readonly ProposalRecord[];
  selectedId: string | null;
  /** The list's Display options density (`useListDisplay`). */
  density?: ListDensity;
  onSelect: (id: string) => void;
};

export function TriageQueueList({
  proposals,
  selectedId,
  density = "comfortable",
  onSelect,
}: TriageQueueListProps) {
  const days = groupItemsByDay([...proposals], (p) => p.createdAt);

  return (
    <div role="listbox" aria-label="Proposals">
      {days.map((day) => (
        <QueueDayGroup key={day.key} label={day.label} count={day.items.length}>
          {day.items.map((row) => {
            const isSelected = selectedId === row.id;
            return (
              <li key={row.id}>
                <QueueRow
                  role="option"
                  aria-selected={isSelected}
                  isSelected={isSelected}
                  onClick={() => {
                    onSelect(row.id);
                  }}
                  className={density === "compact" ? "py-0.5" : "py-2"}
                  trailing={<StatusDot status={row.status} />}
                >
                  <QueueRowTitle className="font-sans">
                    {proposalTitle(row)}
                  </QueueRowTitle>
                  <span className="text-muted-foreground truncate text-xs">
                    {opLabel(proposalPatch(row))}
                    {row.evidenceIds.length > 0
                      ? ` · ${row.evidenceIds.length} ev`
                      : ""}
                  </span>
                  <QueueRowInstantMeta value={row.createdAt} id={row.id} />
                </QueueRow>
              </li>
            );
          })}
        </QueueDayGroup>
      ))}
    </div>
  );
}

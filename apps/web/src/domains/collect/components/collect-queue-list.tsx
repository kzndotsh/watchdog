import type { CollectRow, CollectState } from "@/domains/collect/types";
import { DetailStatusChip } from "@/shared/ui/detail-status-chip";
import { groupItemsByDay } from "@/shared/ui/group-by-day";
import { QueueDayGroup } from "@/shared/ui/queue-day-group";
import {
  QueueRow,
  QueueRowInstantMeta,
  QueueRowTitle,
} from "@/shared/ui/queue-row";
import { StatusDot } from "@/shared/ui/status-dot";
import type { DisplayStatus } from "@/shared/ui/vocab";

function collectStateToDisplayStatus(state: CollectState): DisplayStatus {
  switch (state) {
    case "queued": {
      return "queued";
    }
    case "running": {
      return "running";
    }
    case "unprocessed": {
      return "pending";
    }
    case "landed": {
      return "succeeded";
    }
    case "failed": {
      return "failed";
    }
    case "hidden": {
      return "cancelled";
    }
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

function collectStateIsLive(state: CollectState): boolean {
  return state === "queued" || state === "running";
}

export interface CollectQueueListProps {
  rows: readonly CollectRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function CollectQueueList({
  rows,
  selectedId,
  onSelect,
}: CollectQueueListProps) {
  const days = groupItemsByDay([...rows], (row) => row.when);

  return (
    <div role="listbox" aria-label="Collect items">
      {days.map((day) => (
        <QueueDayGroup key={day.key} label={day.label} count={day.items.length}>
          {day.items.map((row) => {
            const live = collectStateIsLive(row.state);
            return (
              <li key={row.id}>
                <QueueRow
                  role="option"
                  aria-selected={row.id === selectedId}
                  selected={row.id === selectedId}
                  live={live}
                  onClick={() => {
                    onSelect(row.id);
                  }}
                  className="py-2"
                  trailing={
                    <StatusDot
                      status={collectStateToDisplayStatus(row.state)}
                      pulse={row.state === "running"}
                    />
                  }
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    <QueueRowTitle>{row.title}</QueueRowTitle>
                    {row.recipe === null ? null : (
                      <DetailStatusChip className="shrink-0">
                        {row.recipe.step}/{row.recipe.total}
                      </DetailStatusChip>
                    )}
                  </div>
                  {row.hint !== null && row.hint !== "" ? (
                    <span className="text-foreground/70 truncate text-xs">
                      {row.hint}
                    </span>
                  ) : null}
                  <QueueRowInstantMeta value={row.when} id={row.id} />
                </QueueRow>
              </li>
            );
          })}
        </QueueDayGroup>
      ))}
    </div>
  );
}

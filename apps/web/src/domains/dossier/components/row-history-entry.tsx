import {
  HISTORY_CHANNEL_LABELS,
  HISTORY_OP_LABELS,
  historyChangedFieldsLine,
} from "@/domains/dossier/lib/history-labels";
import { ActorMention } from "@/shared/ui/actor-mention";
import { RelativeTime } from "@/shared/ui/relative-time";
import type { GraphHistoryEntry } from "@watchdog/schemas/graph";

type RowHistoryEntryProps = {
  entry: GraphHistoryEntry;
};

/** One change in a row's history: the verb, who, how, when, and which fields moved. */
export function RowHistoryEntry({ entry }: RowHistoryEntryProps) {
  const channel = HISTORY_CHANNEL_LABELS[entry.channel];
  const fields = historyChangedFieldsLine(entry.op, entry.changedFields);
  return (
    <li className="flex flex-col gap-0.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-foreground text-xs font-medium">
          {HISTORY_OP_LABELS[entry.op]}
        </span>
        {entry.actorName === null ? (
          <span className="text-muted-foreground text-xs">
            {HISTORY_CHANNEL_LABELS.system}
          </span>
        ) : (
          <ActorMention label={entry.actorName} prefix="by" size="sm" />
        )}
        {channel !== null && entry.actorName !== null ? (
          <span className="text-muted-foreground text-xs">{channel}</span>
        ) : null}
        <RelativeTime value={entry.at} className="text-xs" />
      </div>
      {fields === null ? null : (
        <p className="text-muted-foreground text-xs break-words">{fields}</p>
      )}
    </li>
  );
}

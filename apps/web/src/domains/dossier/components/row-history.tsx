import { HistoryIcon } from "lucide-react";

import { RowHistoryPopup } from "@/domains/dossier/components/row-history-popup";
import { HISTORY_KIND_NOUNS } from "@/domains/dossier/lib/history-labels";
import { Button } from "@/shared/ui/primitives/button";
import type { GraphHistoryKind } from "@watchdog/schemas/shared";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@watchdog/ui/components/popover";

type RowHistoryProps = {
  caseId: string;
  kind: GraphHistoryKind;
  rowId: string;
};

/**
 * Who created and last changed a Graph row, and the row's history (newest
 * first), in a small popover. Nothing is fetched until it is opened.
 */
export function RowHistory({ caseId, kind, rowId }: RowHistoryProps) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label={`History of this ${HISTORY_KIND_NOUNS[kind]}`}
            title="History"
          />
        }
      >
        <HistoryIcon />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <PopoverHeader>
          <PopoverTitle>History</PopoverTitle>
        </PopoverHeader>
        <RowHistoryPopup caseId={caseId} kind={kind} rowId={rowId} />
      </PopoverContent>
    </Popover>
  );
}

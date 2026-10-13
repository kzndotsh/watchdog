import { CheckIcon, InfoIcon, XIcon } from "lucide-react";

import { Button } from "@/shared/ui/primitives/button";
import { WithTooltip } from "@/shared/ui/with-tooltip";
import { TableCell } from "@watchdog/ui/components/table";

type DataTableComposerActionsProps = {
  busy: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  colSpan?: number;
  /** Shown as a far-right info icon tooltip when submit is blocked for a specific reason. */
  blockedHint?: string;
};

export function DataTableComposerActions({
  busy,
  canSubmit,
  onSubmit,
  onCancel,
  colSpan = 1,
  blockedHint,
}: DataTableComposerActionsProps) {
  return (
    <TableCell colSpan={colSpan}>
      <div className="flex w-full items-center justify-center gap-1">
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          disabled={busy || !canSubmit}
          onClick={onSubmit}
          aria-label="Save"
          title="Save (Enter)"
        >
          <CheckIcon className="size-3.5" />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          disabled={busy}
          onClick={onCancel}
          aria-label="Cancel"
          title="Cancel (Esc)"
        >
          <XIcon className="size-3.5" />
        </Button>
        {blockedHint ? (
          <WithTooltip content={blockedHint} side="left">
            <InfoIcon
              className="text-muted-foreground size-3.5 shrink-0"
              aria-label={blockedHint}
            />
          </WithTooltip>
        ) : null}
      </div>
    </TableCell>
  );
}

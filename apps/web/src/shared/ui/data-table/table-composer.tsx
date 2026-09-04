import { CheckIcon, InfoIcon, PlusIcon, XIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/shared/ui/shadcn/button";
import { Input } from "@/shared/ui/shadcn/input";
import { TableCell, TableRow } from "@/shared/ui/shadcn/table";
import { WithTooltip } from "@/shared/ui/timestamp";

const TABLE_COMPOSER_INPUT_CLASS =
  "h-7 w-full rounded-md border-transparent bg-transparent px-1.5 py-0 text-xs shadow-none focus-visible:bg-background/60 focus-visible:border-transparent focus-visible:!shadow-none focus-visible:!ring-0 focus-visible:outline-none";

export function TableComposerInput({
  className,
  ...props
}: ComponentProps<typeof Input>) {
  return (
    <Input className={cn(TABLE_COMPOSER_INPUT_CLASS, className)} {...props} />
  );
}

export function DataTableAddRow({
  colSpan,
  label,
  onClick,
}: {
  colSpan: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <TableRow
      className="text-muted-foreground hover:bg-muted/30 hover:text-foreground cursor-pointer border-dashed"
      onClick={onClick}
    >
      <TableCell colSpan={colSpan}>
        <span className="inline-flex items-center gap-1.5 text-xs">
          <PlusIcon className="size-3.5 -translate-y-px" />
          {label}
        </span>
      </TableCell>
    </TableRow>
  );
}

export function DataTableComposerActions({
  busy,
  canSubmit,
  onSubmit,
  onCancel,
  colSpan = 1,
  blockedHint,
}: {
  busy: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  colSpan?: number;
  /** Shown as a far-right info icon tooltip when submit is blocked for a specific reason. */
  blockedHint?: string;
}) {
  return (
    <TableCell colSpan={colSpan}>
      <div className="flex w-full items-center justify-center gap-1">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0"
          disabled={busy || !canSubmit}
          onClick={onSubmit}
          title="Save (Enter)"
        >
          <CheckIcon className="size-3.5" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0"
          disabled={busy}
          onClick={onCancel}
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

export function DataTableComposerRow({ children }: { children: ReactNode }) {
  return (
    <TableRow className="bg-muted/15 hover:bg-muted/15 border-dashed">
      {children}
    </TableRow>
  );
}

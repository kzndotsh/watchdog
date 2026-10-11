import { PlusIcon } from "lucide-react";

import { TableCell, TableRow } from "@watchdog/ui/components/table";

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

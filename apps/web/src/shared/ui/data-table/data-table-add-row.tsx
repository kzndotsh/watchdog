import { PlusIcon } from "lucide-react";

import { Button } from "@/shared/ui/primitives/button";
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
    <TableRow className="border-dashed">
      <TableCell colSpan={colSpan}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground gap-1.5 text-xs"
          onClick={onClick}
        >
          <PlusIcon className="size-3.5 -translate-y-px" />
          {label}
        </Button>
      </TableCell>
    </TableRow>
  );
}

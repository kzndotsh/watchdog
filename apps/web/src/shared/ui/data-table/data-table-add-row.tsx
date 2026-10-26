import { PlusIcon } from "lucide-react";

import { Button } from "@/shared/ui/primitives/button";
import { TableCell, TableRow } from "@watchdog/ui/components/table";

type DataTableAddRowProps = {
  colSpan: number;
  label: string;
  onClick: () => void;
  /** Pointer enter or focus: warm what the click opens. */
  onIntent?: () => void;
};

export function DataTableAddRow({
  colSpan,
  label,
  onClick,
  onIntent,
}: DataTableAddRowProps) {
  return (
    <TableRow className="border-dashed">
      <TableCell colSpan={colSpan}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground gap-1.5 text-xs"
          onClick={onClick}
          onPointerEnter={onIntent}
          onFocus={onIntent}
        >
          <PlusIcon className="size-3.5 -translate-y-px" />
          {label}
        </Button>
      </TableCell>
    </TableRow>
  );
}

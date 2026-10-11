import type { ReactNode } from "react";

import { TableRow } from "@watchdog/ui/components/table";

export function DataTableComposerRow({ children }: { children: ReactNode }) {
  return (
    <TableRow className="bg-muted/15 hover:bg-muted/15 border-dashed">
      {children}
    </TableRow>
  );
}

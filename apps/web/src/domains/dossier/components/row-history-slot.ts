import { createElement, type ReactNode } from "react";

import { RowHistory } from "@/domains/dossier/components/row-history";
import type { GraphHistoryKind } from "@watchdog/schemas/shared";

/**
 * A row's history control as a `TargetActionsHost` `trailing` slot, so a section
 * adds one line per row instead of a block (the big sections are over budget).
 */
export function rowHistorySlot(
  caseId: string,
  kind: GraphHistoryKind,
  rowId: string
): ReactNode {
  return createElement(RowHistory, { caseId, kind, rowId });
}

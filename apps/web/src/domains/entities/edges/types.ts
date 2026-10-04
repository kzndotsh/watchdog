import type { z } from "zod";

import type {
  CaseEdgeRecord as CoreCaseEdgeRecord,
  EdgeRecord as CoreEdgeRecord,
} from "@watchdog/core/graph";
import type {
  createEdgeInputSchema,
  edgeScopeInputSchema,
  updateEdgeInputSchema,
} from "@watchdog/schemas";

export type EdgeRecord = CoreEdgeRecord;
export type CaseEdgeRecord = CoreCaseEdgeRecord;

export type CreateEdgeInput = z.output<typeof createEdgeInputSchema>;

export type EdgeScopeInput = z.output<typeof edgeScopeInputSchema>;

export type UpdateEdgeInput = z.input<typeof updateEdgeInputSchema>;

import type { z } from "zod";

import type {
  CaseEdgeRecord as CoreCaseEdgeRecord,
  EdgeRecord as CoreEdgeRecord,
} from "@watchdog/core";
import {
  createEdgeInputSchema,
  edgeScopeInputSchema,
  updateEdgeInputSchema,
} from "@watchdog/schemas";

export type EdgeRecord = CoreEdgeRecord;
export type CaseEdgeRecord = CoreCaseEdgeRecord;

export {
  caseScopeInputSchema,
  entityScopeInputSchema,
  type CaseScopeInput,
  type EntityScopeInput,
} from "@watchdog/schemas";

export { createEdgeInputSchema };
export type CreateEdgeInput = z.output<typeof createEdgeInputSchema>;

export { edgeScopeInputSchema };
export type EdgeScopeInput = z.output<typeof edgeScopeInputSchema>;

export { updateEdgeInputSchema };
export type UpdateEdgeInput = z.input<typeof updateEdgeInputSchema>;

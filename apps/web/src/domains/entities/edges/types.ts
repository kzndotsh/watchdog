import type { z } from "zod";

import type {
  EdgeRecord as CoreEdgeRecord,
  GraphSnapshot as CoreGraphSnapshot,
} from "@watchdog/core/graph";
import type {
  createEdgeInputSchema,
  edgeScopeInputSchema,
  updateEdgeInputSchema,
} from "@watchdog/schemas/graph";

export type EdgeRecord = CoreEdgeRecord;
/** The Graph page's capped snapshot: the most connected Entities and the Connections between them. */
export type GraphSnapshot = CoreGraphSnapshot;

export type CreateEdgeInput = z.output<typeof createEdgeInputSchema>;

export type EdgeScopeInput = z.output<typeof edgeScopeInputSchema>;

export type UpdateEdgeInput = z.input<typeof updateEdgeInputSchema>;

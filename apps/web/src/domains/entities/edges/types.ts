import type { z } from "zod";

import type {
  CaseEdgeRecord as CoreCaseEdgeRecord,
  EdgeRecord as CoreEdgeRecord,
  GraphEgo as CoreGraphEgo,
  GraphSnapshot as CoreGraphSnapshot,
} from "@watchdog/core/graph";
import type {
  createEdgeInputSchema,
  edgeScopeInputSchema,
  updateEdgeInputSchema,
} from "@watchdog/schemas/graph";

/** A Connection seen from one Entity: its peer and direction (writes return it). */
export type EdgeRecord = CoreEdgeRecord;
/** A row of the Connection list: both ends, absolute (an Entity's tab orients it). */
export type CaseEdgeRecord = CoreCaseEdgeRecord;
/** The Dossier ego graph's capped read: the Entity's Connections with each peer's label. */
export type GraphEgo = CoreGraphEgo;
/** The Graph page's capped snapshot: the most connected Entities and the Connections between them. */
export type GraphSnapshot = CoreGraphSnapshot;

export type CreateEdgeInput = z.output<typeof createEdgeInputSchema>;

export type EdgeScopeInput = z.output<typeof edgeScopeInputSchema>;

export type UpdateEdgeInput = z.input<typeof updateEdgeInputSchema>;

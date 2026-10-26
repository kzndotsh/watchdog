import { entityConformance } from "./entities.ts";
import { evidenceConformance } from "./evidence.ts";
import { identifierConformance } from "./identifiers.ts";
import { proposalConformance } from "./proposals.ts";
import type { ListConformance } from "./types.ts";

/**
 * Behaviour fixtures of every declared list, keyed by list name (ADR-0007). A list in
 * `LIST_DEFS` without an entry here fails core's conformance test.
 */
export const LIST_CONFORMANCE: Readonly<Record<string, ListConformance>> = {
  [evidenceConformance.list]: evidenceConformance,
  [identifierConformance.list]: identifierConformance,
  [entityConformance.list]: entityConformance,
  [proposalConformance.list]: proposalConformance,
};

export type {
  ConformanceFacts,
  ConformanceRow,
  ListConformance,
} from "./types.ts";

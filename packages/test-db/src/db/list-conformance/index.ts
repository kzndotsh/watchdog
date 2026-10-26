import { claimConformance } from "./claims.ts";
import { collectConformance } from "./collect.ts";
import { deletedCaseConformance } from "./deleted-cases.ts";
import { edgeConformance } from "./edges.ts";
import { entityConformance } from "./entities.ts";
import { eventConformance } from "./events.ts";
import { evidenceConformance } from "./evidence.ts";
import { identifierConformance } from "./identifiers.ts";
import { proposalConformance } from "./proposals.ts";
import { questionConformance } from "./questions.ts";
import { taskConformance } from "./tasks.ts";
import type { ListConformance } from "./types.ts";

/**
 * Behaviour fixtures of every declared list, keyed by list name (ADR-0007). A list in
 * `LIST_DEFS` without an entry here fails core's conformance test.
 */
export const LIST_CONFORMANCE: Readonly<Record<string, ListConformance>> = {
  [evidenceConformance.list]: evidenceConformance,
  [identifierConformance.list]: identifierConformance,
  [entityConformance.list]: entityConformance,
  [deletedCaseConformance.list]: deletedCaseConformance,
  [proposalConformance.list]: proposalConformance,
  [taskConformance.list]: taskConformance,
  [claimConformance.list]: claimConformance,
  [eventConformance.list]: eventConformance,
  [questionConformance.list]: questionConformance,
  [edgeConformance.list]: edgeConformance,
  [collectConformance.list]: collectConformance,
};

export type {
  ConformanceFacts,
  ConformanceRow,
  ListConformance,
} from "./types.ts";

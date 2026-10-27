import type { AnyListRepo } from "../repos/_list-query";
import { caseListRepo } from "../repos/case-list.repo";
import { claimListRepo } from "../repos/claim-list.repo";
import { collectListRepo } from "../repos/collect-list.repo";
import { deletedCaseListRepo } from "../repos/deleted-case-list.repo";
import { edgeListRepo } from "../repos/edge-list.repo";
import { entityListRepo } from "../repos/entity-list.repo";
import { eventListRepo } from "../repos/event-list.repo";
import { evidenceListRepo } from "../repos/evidence-list.repo";
import { graphWriteListRepo } from "../repos/graph-write-list.repo";
import { identifierListRepo } from "../repos/identifier-list.repo";
import { jobListRepo } from "../repos/job-list.repo";
import { proposalListRepo } from "../repos/proposal-list.repo";
import { questionListRepo } from "../repos/question-list.repo";
import { taskListRepo } from "../repos/task-list.repo";

/**
 * Every declared list's binding (ADR-0007), for tests only (`@watchdog/db/testing`, never the
 * main barrel): core's `list-conformance.int.test.ts` runs its behaviour and plan battery per
 * entry, and `list-bindings.test.ts` checks the names equal `LIST_DEFS`. A new list joins here
 * in the same change as its binding.
 */
export const LIST_REPOS: readonly AnyListRepo[] = [
  evidenceListRepo,
  identifierListRepo,
  entityListRepo,
  deletedCaseListRepo,
  proposalListRepo,
  taskListRepo,
  claimListRepo,
  eventListRepo,
  questionListRepo,
  edgeListRepo,
  collectListRepo,
  caseListRepo,
  jobListRepo,
  graphWriteListRepo,
];

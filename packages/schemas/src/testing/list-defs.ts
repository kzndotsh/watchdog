import { caseList } from "../case-list";
import { claimList } from "../claim-list";
import { collectList } from "../collect-list";
import { deletedCaseList } from "../deleted-case-list";
import { edgeList } from "../edge-list";
import { entityList } from "../entity-list";
import { eventList } from "../event-list";
import { evidenceList } from "../evidence-list";
import { graphWriteList } from "../graph-write-list";
import { identifierList } from "../identifier-list";
import { jobList } from "../job-list";
import type { AnyListDef } from "../lists/define-list";
import { proposalList } from "../proposal-list";
import { questionList } from "../question-list";
import { taskList } from "../task-list";

/**
 * Every declared list (ADR-0007), for tests only: the schemas property test (canonical round
 * trips), and later db's binding test, core's conformance test and api's pagination coverage.
 * A new list joins here in the same change as its declaration.
 */
export const LIST_DEFS: readonly AnyListDef[] = [
  evidenceList,
  identifierList,
  entityList,
  deletedCaseList,
  proposalList,
  taskList,
  claimList,
  eventList,
  questionList,
  edgeList,
  collectList,
  caseList,
  jobList,
  graphWriteList,
];

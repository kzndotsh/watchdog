import { entityList } from "../entity-list";
import { evidenceList } from "../evidence-list";
import { identifierList } from "../identifier-list";
import type { AnyListDef } from "../lists/define-list";

/**
 * Every declared list (ADR-0007), for tests only: the schemas property test (canonical round
 * trips), and later db's binding test, core's conformance test and api's pagination coverage.
 * A new list joins here in the same change as its declaration.
 */
export const LIST_DEFS: readonly AnyListDef[] = [
  evidenceList,
  identifierList,
  entityList,
];

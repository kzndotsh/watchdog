import type { AnyListRepo } from "../repos/_list-query";
import { deletedCaseListRepo } from "../repos/deleted-case-list.repo";
import { entityListRepo } from "../repos/entity-list.repo";
import { evidenceListRepo } from "../repos/evidence-list.repo";
import { identifierListRepo } from "../repos/identifier-list.repo";

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
];

// oxlint-disable-next-line unicorn/prefer-export-from -- a binding on purpose: `export ... from` of another workspace package is banned (check:workspace-reexports)
import { db } from "@watchdog/db";

/** The shared test connection: tests import it from here so api and caps never depend on `@watchdog/db`. A binding, not a re-export of the db module. */
export const testDb = db;

export { resetE2eDb, resetTestDb, withTestTx } from "./db/with-test-tx.ts";
export {
  backdateJob,
  seedAuthUser,
  seedCase,
  seedEntity,
  seedEntityBlankDisplayName,
  seedEvidence,
  seedFindingSuppression,
  seedGraphWrite,
  seedIdentifier,
  seedJob,
  seedPlaybookRun,
  seedProposal,
} from "./db/seed/index.ts";

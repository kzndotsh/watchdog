import {
  findingSuppressionsRepo,
  type DbExec,
  type NewFindingSuppression,
} from "@watchdog/db";

import { withCaseOrganizationScope } from "../organization-scope.ts";

export async function seedFindingSuppression(
  exec: DbExec,
  row: NewFindingSuppression
): Promise<void> {
  await withCaseOrganizationScope(exec, row.caseId, async (tx) =>
    findingSuppressionsRepo.insertMany(tx, [row])
  );
}

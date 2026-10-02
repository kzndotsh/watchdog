import {
  findingSuppressionsRepo,
  type DbExec,
  type NewFindingSuppression,
} from "@watchdog/db";

export async function seedFindingSuppression(
  exec: DbExec,
  row: NewFindingSuppression
): Promise<void> {
  await findingSuppressionsRepo.insertMany(exec, [row]);
}

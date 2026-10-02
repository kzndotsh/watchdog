import {
  playbookRunsRepo,
  type DbExec,
  type NewPlaybookRun,
  type PlaybookRunRow,
} from "@watchdog/db";
import { TEST_ACTOR_ID } from "@watchdog/test-kit/fixtures";

export async function seedPlaybookRun(
  exec: DbExec,
  caseId: string,
  overrides?: Partial<NewPlaybookRun>
): Promise<PlaybookRunRow> {
  const overridesResolved = overrides ?? {};
  const created = await playbookRunsRepo.create(exec, {
    caseId,
    playbookId: overridesResolved.playbookId ?? "url-capture",
    seed: overridesResolved.seed ?? { url: "https://mailhost.test/" },
    status: overridesResolved.status ?? "running",
    actorId: overridesResolved.actorId ?? TEST_ACTOR_ID,
  });
  if (!created) {
    throw new Error("seedPlaybookRun failed");
  }
  return created;
}

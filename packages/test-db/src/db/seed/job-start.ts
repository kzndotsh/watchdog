import {
  jobStartCountersRepo,
  type DbExec,
  type TakeJobStart,
} from "@watchdog/db";

/**
 * Count `count` Job starts for a subject in the current window, as if that many Jobs had been
 * started, without creating any Job or queueing anything. `windowSeconds` is the window the code
 * under test counts in (`WD_JOB_START_WINDOW_SECONDS`; the API reports it as `windowSeconds`).
 */
export async function seedJobStarts(
  exec: DbExec,
  values: Pick<TakeJobStart, "scope" | "subjectId" | "windowSeconds"> & {
    count: number;
  }
): Promise<void> {
  const { count, ...subject } = values;
  for (let taken = 0; taken < count; taken += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each start is one row-locked increment
    await jobStartCountersRepo.take(exec, { ...subject, limit: count });
  }
}

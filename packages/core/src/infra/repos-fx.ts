import {
  capCacheRepo,
  casesRepo,
  jobsRepo,
  playbookRunsRepo,
  proposalsRepo,
} from "@watchdog/db";

import { repoFx, repoFxDb } from "./repo-fx";

/**
 * The repos as Effect modules (ADR-0002, #444). `xRepoFx.m(exec, ...)` takes the handle
 * explicitly (a transaction's `tx`, or any `exec`); `xRepoFxDb.m(...)` is the same method on
 * the pool, reading the `Db` service. Add a repo here when an area moves onto it.
 */
export const jobsRepoFx = repoFx(() => jobsRepo);
export const jobsRepoFxDb = repoFxDb(jobsRepoFx);
export const playbookRunsRepoFx = repoFx(() => playbookRunsRepo);
export const playbookRunsRepoFxDb = repoFxDb(playbookRunsRepoFx);
export const casesRepoFx = repoFx(() => casesRepo);
export const casesRepoFxDb = repoFxDb(casesRepoFx);
const capCacheRepoFx = repoFx(() => capCacheRepo);
export const capCacheRepoFxDb = repoFxDb(capCacheRepoFx);
export const proposalsRepoFx = repoFx(() => proposalsRepo);

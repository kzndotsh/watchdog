import {
  capCacheRepo,
  casesRepo,
  jobsRepo,
  playbookRunsRepo,
  proposalsRepo,
  activityCursorsRepo,
  activityFloorRepo,
  activityLogRepo,
  caseDeletionRecordsRepo,
  claimsRepo,
  credentialsRepo,
  edgesRepo,
  entitiesRepo,
  eventsRepo,
  evidenceLinksRepo,
  evidenceRepo,
  evidenceUploadsRepo,
  findingSuppressionsRepo,
  graphHistoryRepo,
  graphWritesRepo,
  identifiersRepo,
  organizationSettingsRepo,
  questionsRepo,
  tasksRepo,
  usersRepo,
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
export const activityCursorsRepoFx = repoFx(() => activityCursorsRepo);
export const activityCursorsRepoFxDb = repoFxDb(activityCursorsRepoFx);
export const activityFloorRepoFx = repoFx(() => activityFloorRepo);
export const activityFloorRepoFxDb = repoFxDb(activityFloorRepoFx);
export const activityLogRepoFx = repoFx(() => activityLogRepo);
export const activityLogRepoFxDb = repoFxDb(activityLogRepoFx);
export const caseDeletionRecordsRepoFx = repoFx(() => caseDeletionRecordsRepo);
export const claimsRepoFx = repoFx(() => claimsRepo);
export const claimsRepoFxDb = repoFxDb(claimsRepoFx);
const credentialsRepoFx = repoFx(() => credentialsRepo);
export const credentialsRepoFxDb = repoFxDb(credentialsRepoFx);
export const edgesRepoFx = repoFx(() => edgesRepo);
export const edgesRepoFxDb = repoFxDb(edgesRepoFx);
export const entitiesRepoFx = repoFx(() => entitiesRepo);
export const entitiesRepoFxDb = repoFxDb(entitiesRepoFx);
const eventsRepoFx = repoFx(() => eventsRepo);
export const eventsRepoFxDb = repoFxDb(eventsRepoFx);
export const evidenceLinksRepoFx = repoFx(() => evidenceLinksRepo);
export const evidenceLinksRepoFxDb = repoFxDb(evidenceLinksRepoFx);
export const evidenceRepoFx = repoFx(() => evidenceRepo);
export const evidenceRepoFxDb = repoFxDb(evidenceRepoFx);
export const evidenceUploadsRepoFx = repoFx(() => evidenceUploadsRepo);
export const evidenceUploadsRepoFxDb = repoFxDb(evidenceUploadsRepoFx);
export const findingSuppressionsRepoFx = repoFx(() => findingSuppressionsRepo);
const graphHistoryRepoFx = repoFx(() => graphHistoryRepo);
export const graphHistoryRepoFxDb = repoFxDb(graphHistoryRepoFx);
const graphWritesRepoFx = repoFx(() => graphWritesRepo);
export const graphWritesRepoFxDb = repoFxDb(graphWritesRepoFx);
export const identifiersRepoFx = repoFx(() => identifiersRepo);
export const identifiersRepoFxDb = repoFxDb(identifiersRepoFx);
export const organizationSettingsRepoFx = repoFx(
  () => organizationSettingsRepo
);
export const organizationSettingsRepoFxDb = repoFxDb(
  organizationSettingsRepoFx
);
export const proposalsRepoFxDb = repoFxDb(proposalsRepoFx);
export const questionsRepoFx = repoFx(() => questionsRepo);
export const questionsRepoFxDb = repoFxDb(questionsRepoFx);
export const tasksRepoFx = repoFx(() => tasksRepo);
export const tasksRepoFxDb = repoFxDb(tasksRepoFx);
const usersRepoFx = repoFx(() => usersRepo);
export const usersRepoFxDb = repoFxDb(usersRepoFx);

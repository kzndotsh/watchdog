export {
  acquirePool,
  client,
  createPool,
  db,
  endPool,
  POOL_END_TIMEOUT_SECONDS,
  withPool,
  type Db,
  type Pool,
} from "./client";
export type { DbTx, DbExec } from "./exec";
export {
  emailTaken,
  hasInstanceAdmin,
  insertInstanceAdmin,
  lockInstanceBootstrap,
  promoteFirstUserToInstanceAdmin,
  setSessionActiveOrganization,
} from "./auth/instance-bootstrap";
export { lockVaultRekey } from "./vault-lock";
export { tryLockJobReconcile } from "./job-reconcile-lock";
export {
  setGraphHistoryContext,
  type GraphHistoryContext,
} from "./history-context";
export { insertAuthEvent } from "./auth/auth-events";
export type { InsertAuthEventInput } from "./auth/auth-events";
export { onAuthSessionCreated } from "./auth/on-session-created";
export { resolveUserOrganizationId } from "./auth/resolve-organization";
export { isUserBanned } from "./auth/user-ban";
export { apiKeyStatus } from "./auth/api-key-status";
export type { ApiKeyStatus } from "./auth/api-key-status";
export {
  account,
  activity,
  activityFloor,
  apiKey,
  authEvent,
  authSchema,
  capCache,
  caseDeletionRecords,
  cases,
  claimEvidence,
  claims,
  credentials,
  edgeEvidence,
  edges,
  entities,
  events,
  evidence,
  evidenceUploads,
  findingSuppressions,
  graphHistory,
  graphWrites,
  identifierEvidence,
  identifiers,
  invitation,
  jobEvidence,
  jobs,
  member,
  organization,
  organizationSettings,
  playbookRuns,
  proposalEvidence,
  proposals,
  questions,
  session,
  tasks,
  user,
  verification,
} from "./schema/index";
export type {
  CasePurgeCounts,
  GraphHistorySnapshotJson,
  JobArtifact,
} from "./schema/index";
export * from "./repos/index";
export { listenOnChannel, ACTIVITY_CHANNEL } from "./events";
export {
  createActivityTailer,
  type ActivityTailer,
  type ActivityTailerOptions,
  type ActivityTailSubscription,
} from "./activity-tailer";

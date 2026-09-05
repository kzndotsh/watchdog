export {
  uploadArtifactEffect,
  readArtifactBytesEffect,
  sha256Hex,
  assertSha256Hex,
  artifactUri,
  createPresignedGetEffect,
  deleteCaseArtifactsEffect,
  MAX_UPLOAD_BYTES,
} from "./infra/blob";
export type { UploadedArtifact, PresignedPut } from "./infra/blob";
export {
  CAP_JOB_QUEUE,
  enqueueCapJobEffect,
  ensureBossProducerEffect,
  ensureBossWorkerEffect,
  isCapJobPayload,
  type CapJobPayload,
  type BossRole,
  type BossHandle,
} from "./jobs/boss";
export {
  capExpireSeconds,
  gracefulStopTimeoutMs,
  queueExpireSeconds,
  POST_RUN_SLACK_MS,
} from "./jobs/timeouts";
export {
  reconcileStaleJobsEffect,
  reconcileStuckPlaybookRunsEffect,
} from "./jobs/reconcile-stale-jobs";
export {
  actorHandleFromUser,
  formatActorLabel,
  maskEmailForActor,
  storedApiKeyActorLabel,
} from "./actors/format-actor-label";
export { parsePatch, tryParsePatch } from "./graph/patch/patch";
export {
  applyPatchEffect,
  type ApplyPatchOpts,
  type ApplyPatchTx,
} from "./graph/patch/apply-patch";
export {
  suppressKnownFindings,
  recordRejectedFingerprints,
} from "./proposals/finding-suppress";
export { parseAgentPatchEffect } from "./graph/patch/parse-agent-patch";
export {
  createAgentProposalEffect,
  writeGraphFromAgentEffect,
  listGraphWritesForCaseEffect,
  type GraphWriteRecord,
  type AgentGraphWriteResult,
} from "./proposals/agent-ingress";
export { JobFibers, type JobFibersApi } from "./jobs/job-fibers";
export {
  executeJobOnMap,
  type JobRunOutcome,
  type JobAbortReason,
  type JobRunOutcomeName,
} from "./jobs/run-job";
export {
  loadCapReportEffect,
  artifactsHaveCapReport,
} from "./jobs/load-cap-report";
export {
  startJobEffect,
  listJobsForCaseEffect,
  getJobForCaseEffect,
  cancelJobEffect,
  findCancelledJobIdsEffect,
  type StartJobInput,
  type JobRecord,
  type JobListRecord,
} from "./jobs/start-job";
export {
  runPlaybookEffect,
  cancelPlaybookRunEffect,
  type RunPlaybookInput,
  type PlaybookRunResult,
} from "./jobs/run-playbook";
export {
  processEvidenceEffect,
  markEvidenceProcessedEffect,
  enrichUrlEvidenceEffect,
} from "./evidence/process-evidence";
export {
  snapshotToArtifactBytes,
  MAX_SNAPSHOT_CHARS,
} from "./evidence/pack-evidence-snapshot";
export {
  listProposalsForCaseEffect,
  getProposalForCaseEffect,
  acceptProposalEffect,
  rejectProposalEffect,
  type ProposalRecord,
} from "./proposals/proposals";
export type { IdentifierCollision } from "./graph/identifier-collisions";
export {
  VaultError,
  listCredentialMetaEffect,
  hasCredentialEffect,
  getCredentialEffect,
  putCredentialEffect,
  deleteCredentialEffect,
  type CredentialMeta,
} from "./infra/vault";
export {
  listCredentialSlotsEffect,
  putCredentialSlotEffect,
  type CredentialSlot,
} from "./infra/credential-slots";
export {
  createCaseEffect,
  listCasesEffect,
  getCaseByIdEffect,
  getCaseBySlugEffect,
  updateCaseEffect,
  deleteCaseEffect,
  type CaseRecord,
  type CreateCaseInput,
} from "./cases/cases";
export {
  listClaimsForEntityEffect,
  createClaimEffect,
  updateClaimEffect,
  retractClaimEffect,
  type ClaimRecord,
  type CreateClaimInput,
  type UpdateClaimInput,
  type RetractClaimInput,
} from "./graph/claims";
export {
  listEventsForEntityEffect,
  createEventEffect,
  updateEventEffect,
  deleteEventEffect,
  type EventRecord,
  type CreateEventInput,
  type UpdateEventInput,
} from "./graph/events-timeline";
export {
  listQuestionsForEntityEffect,
  createQuestionEffect,
  updateQuestionEffect,
  resolveQuestionEffect,
  reopenQuestionEffect,
  type QuestionRecord,
  type CreateQuestionInput,
  type UpdateQuestionInput,
  type ResolveQuestionInput,
  type ReopenQuestionInput,
} from "./graph/questions";
export {
  listIdentifiersForEntityEffect,
  listIdentifiersForCaseEffect,
  toCaseIdentifierRecord,
  createIdentifierEffect,
  updateIdentifierEffect,
  type IdentifierRecord,
  type CaseIdentifierRecord,
  type CreateIdentifierInput,
  type UpdateIdentifierInput,
} from "./graph/identifiers";
export {
  listEdgesForEntityEffect,
  listEdgesForCaseEffect,
  toCaseEdgeRecord,
  createEdgeEffect,
  updateEdgeEffect,
  deleteEdgeEffect,
  type EdgeRecord,
  type CaseEdgeRecord,
  type CreateEdgeInput,
  type UpdateEdgeInput,
} from "./graph/edges";
export {
  assertCaseExistsUncheckedEffect,
  assertCaseInOrgEffect,
  assertEntityInCaseEffect,
} from "./graph/patch/guards";
export {
  listEntitiesForCaseEffect,
  getEntityByCaseSlugEffect,
  createEntityEffect,
  updateEntityFieldsEffect,
  type EntityRecord,
  type CreateEntityInput,
  type UpdateEntityFieldsInput,
} from "./graph/entities";
export {
  listEvidenceForCaseEffect,
  dumpPasteEffect,
  dumpUrlEffect,
  softDeleteEvidenceEffect,
  restoreEvidenceEffect,
  attachEvidenceEntityEffect,
  presignUploadEffect,
  confirmFileUploadEffect,
  getEvidenceDownloadUrlEffect,
  createAttestationEffect,
  type EvidenceRecord,
  type ListEvidenceOpts,
  type DumpPasteInput,
  type DumpUrlInput,
  type SoftDeleteInput,
  type PresignUploadInput,
  type ConfirmFileUploadInput,
  type CreateAttestationInput,
} from "./evidence/evidence";
export type { DbTx, DbExec } from "@watchdog/db";
export {
  DomainError,
  errorMessage,
  isUniqueViolation,
  type DomainErrorCode,
} from "./infra/domain-error";
export {
  NotFoundError,
  ConflictError,
  InvalidError,
  ForbiddenError,
  fromDomainError,
  mapDomainCatch,
  domainCodeOf,
  domainMessageOf,
  isDomainTag,
  toDomainError,
  type DomainTag,
} from "./infra/tagged-errors";
export { tryDb, mapPostgresCatch } from "./infra/postgres-effect";
export { transact } from "./infra/postgres-tx";
export { runDomain } from "./infra/run-domain";
export {
  notifyEvent,
  notifyEntityChangedEffect,
  notifyTaskChangedEffect,
  notifyProposalCreatedEffect,
  notifyJobUpdateEffect,
  listenForEvents,
  isWatchdogEvent,
  WATCHDOG_CHANNEL,
  type WatchdogEvent,
} from "./infra/events";
export { listenForEventsStream } from "./infra/listen-events-stream";

export {
  renderEntityMarkdownEffect,
  renderCaseExportEffect,
  type EntityExport,
} from "./infra/export";
export {
  ExportIOError,
  writeEntityExportEffect,
  writeCaseExportEffect,
  scheduleCaseExportEffect,
  removeCaseExportDirEffect,
  renameCaseExportDirEffect,
} from "./infra/export-sync";
export {
  listTasksForCaseEffect,
  getTaskInCaseEffect,
  createTaskEffect,
  updateTaskEffect,
  deleteTaskEffect,
  reorderTasksEffect,
  type TaskRecord,
  type CreateTaskInput,
  type UpdateTaskInput,
  type ReorderTasksInput,
  type ListTasksOpts,
} from "./tasks/tasks";
export {
  listRecentActivityEffect,
  mergeActivityItems,
  taskEventAction,
  jobActivityAction,
  type ActivityItem,
  type ActivityKind,
  type ListRecentActivityOpts,
} from "./activity/recent-activity";
export {
  searchCaseEffect,
  type SearchCaseOpts,
  type SearchCaseResult,
  type SearchCaseEntityHit,
  type SearchCaseIdentifierHit,
  type SearchCaseEvidenceHit,
  type SearchCaseTaskHit,
  type SearchCaseJobHit,
  type SearchCaseProposalHit,
  type SearchCaseCaseHit,
} from "./search/search-case";

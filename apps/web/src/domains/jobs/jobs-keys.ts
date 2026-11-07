export const jobsKeys = {
  all: (caseId: string) => ["jobs", caseId] as const,
  /** Under `all`, so every Job refresh of the Case also refreshes it. */
  recent: (caseId: string) => ["jobs", caseId, "recent"] as const,
  detail: (caseId: string, jobId: string) =>
    ["jobs", caseId, "detail", jobId] as const,
  /** Under `all`, so every job mutation and SSE refresh of the Case also refreshes it. */
  playbookRun: (caseId: string, playbookRunId: string) =>
    ["jobs", caseId, "playbook-run", playbookRunId] as const,
  /** Under `all`, so a Job's status change (SSE) refreshes the calls it made. */
  providerCalls: (caseId: string, jobId: string) =>
    ["jobs", caseId, "provider-calls", jobId] as const,
  /** Under `all`, like every other read of the Case's Jobs. */
  jobArtifact: (caseId: string, jobId: string, sha256: string, mime: string) =>
    ["jobs", caseId, "artifact", "job", jobId, sha256, mime] as const,
  evidenceArtifact: (caseId: string, evidenceId: string, mime: string) =>
    ["jobs", caseId, "artifact", "evidence", evidenceId, mime] as const,
};

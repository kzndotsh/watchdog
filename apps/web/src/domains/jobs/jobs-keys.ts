export const jobsKeys = {
  all: (caseId: string) => ["jobs", caseId] as const,
  detail: (caseId: string, jobId: string) =>
    ["jobs", caseId, "detail", jobId] as const,
  /** Under `all`, so every job mutation and SSE refresh of the Case also refreshes it. */
  playbookRun: (caseId: string, playbookRunId: string) =>
    ["jobs", caseId, "playbook-run", playbookRunId] as const,
  /** Under `all`, so a Job's status change (SSE) refreshes the calls it made. */
  providerCalls: (caseId: string, jobId: string) =>
    ["jobs", caseId, "provider-calls", jobId] as const,
  jobArtifact: (caseId: string, jobId: string, sha256: string, mime: string) =>
    ["artifact", "job", caseId, jobId, sha256, mime] as const,
  evidenceArtifact: (caseId: string, evidenceId: string, mime: string) =>
    ["artifact", "evidence", caseId, evidenceId, mime] as const,
};

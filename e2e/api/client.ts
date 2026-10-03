import { expect, type Page } from "@playwright/test";

import { e2eApiParsers } from "./parsers";

type ApiMethod = "GET" | "POST" | "PATCH";
type ApiJsonParser<T> = (json: unknown) => T;

export class E2eApi {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async fetch<T>(
    method: ApiMethod,
    path: string,
    body?: unknown,
    parse?: ApiJsonParser<T>
  ): Promise<T> {
    const response = await this.page.request.fetch(`/api/v1${path}`, {
      method,
      headers: { "content-type": "application/json" },
      data: body,
    });
    if (!response.ok()) {
      throw new Error(
        `${method} ${path} failed: ${response.status()} ${await response.text()}`
      );
    }
    const json: unknown = await response.json();
    if (parse) return parse(json);
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- callers without parse name the contract type
    return json as T;
  }

  async listCases() {
    return this.fetch("GET", "/cases", undefined, e2eApiParsers.caseList);
  }

  async createEntity(
    caseId: string,
    input: { kind: string; name: string; slug: string }
  ) {
    return this.fetch(
      "POST",
      `/cases/${caseId}/entities`,
      { caseId, ...input },
      e2eApiParsers.entity
    );
  }

  async listEvidence(caseId: string) {
    return this.fetch(
      "GET",
      `/cases/${caseId}/evidence`,
      undefined,
      e2eApiParsers.evidenceList
    );
  }

  async attachEvidence(caseId: string, evidenceId: string, entityId: string) {
    return this.fetch("PATCH", `/cases/${caseId}/evidence/${evidenceId}`, {
      caseId,
      evidenceId,
      entityId,
    });
  }

  async listProposals(caseId: string) {
    return this.fetch(
      "GET",
      `/cases/${caseId}/proposals`,
      undefined,
      e2eApiParsers.proposalList
    );
  }

  async listJobs(caseId: string) {
    return this.fetch(
      "GET",
      `/cases/${caseId}/jobs`,
      undefined,
      e2eApiParsers.jobList
    );
  }

  /**
   * Waits for a pending Proposal. On timeout the error names the case's Jobs, so a
   * Harvest that never started (no Jobs) reads differently from one that failed.
   */
  async waitForPendingProposal(caseId: string, timeoutMs: number) {
    try {
      await expect
        .poll(async () => this.countPendingProposals(caseId), {
          timeout: timeoutMs,
        })
        .toBeGreaterThan(0);
    } catch (error) {
      await this.failWithJobs(caseId, timeoutMs, error);
    }
  }

  private async failWithJobs(
    caseId: string,
    timeoutMs: number,
    cause: unknown
  ): Promise<never> {
    const jobs = await this.listJobs(caseId);
    const summary =
      jobs.length === 0
        ? "no Jobs exist for the case (the Harvest request never created one)"
        : jobs
            .map(
              (job) =>
                `${job.capabilityId} ${job.status} error=${job.error ?? "-"} interpretError=${job.interpretError ?? "-"}`
            )
            .join("; ");
    throw new Error(
      `No pending Proposal for case ${caseId} after ${timeoutMs}ms: ${summary}`,
      { cause }
    );
  }

  async countPendingProposals(caseId: string) {
    return this.listProposals(caseId).then(
      (rows) => rows.filter((row) => row.status === "pending").length
    );
  }

  async createProposal(
    caseId: string,
    input: { summary: string; patch: unknown[] }
  ) {
    return this.fetch("POST", `/cases/${caseId}/proposals`, {
      caseId,
      ...input,
    });
  }
}

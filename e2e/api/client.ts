import { expect, type Page } from "@playwright/test";

import { e2eApiParsers, type E2ePage } from "./parsers";

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

  /** Every row of a paged list endpoint: follows `nextCursor` to the last page. */
  private async fetchAll<T>(
    path: string,
    parsePage: (json: unknown) => E2ePage<T>
  ): Promise<T[]> {
    const rows: T[] = [];
    let cursor: string | null = null;
    do {
      const query: string =
        cursor === null
          ? "?limit=200"
          : `?limit=200&cursor=${encodeURIComponent(cursor)}`;
      // oxlint-disable-next-line eslint/no-await-in-loop -- each page names the cursor of the next
      const page: E2ePage<T> = await this.fetch(
        "GET",
        `${path}${query}`,
        undefined,
        parsePage
      );
      rows.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor !== null);
    return rows;
  }

  async listCases() {
    return this.fetchAll("/cases", e2eApiParsers.caseList);
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

  async createIdentifier(
    caseId: string,
    entityId: string,
    input: { type: string; value: string; platform?: string }
  ) {
    return this.fetch(
      "POST",
      `/cases/${caseId}/entities/${entityId}/identifiers`,
      { caseId, entityId, confidence: "unverified", ...input },
      e2eApiParsers.entityId
    );
  }

  async listEvidence(caseId: string) {
    return this.fetchAll(
      `/cases/${caseId}/evidence`,
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
    return this.fetchAll(
      `/cases/${caseId}/proposals`,
      e2eApiParsers.proposalList
    );
  }

  async listJobs(caseId: string) {
    return this.fetchAll(`/cases/${caseId}/jobs`, e2eApiParsers.jobList);
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

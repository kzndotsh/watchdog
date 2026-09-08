import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createCase: vi.fn(),
  createEntity: vi.fn(),
  createEvidence: vi.fn(),
  createGraphWrite: vi.fn(),
  createIdentifier: vi.fn(),
  createJob: vi.fn(),
  createPlaybookRun: vi.fn(),
  createProposal: vi.fn(),
  insertManySuppression: vi.fn(),
}));

vi.mock("@watchdog/db", () => ({
  casesRepo: { create: mocks.createCase },
  entitiesRepo: { create: mocks.createEntity },
  evidenceRepo: { create: mocks.createEvidence },
  graphWritesRepo: { create: mocks.createGraphWrite },
  identifiersRepo: { create: mocks.createIdentifier },
  jobsRepo: { create: mocks.createJob },
  playbookRunsRepo: { create: mocks.createPlaybookRun },
  proposalsRepo: { create: mocks.createProposal },
  findingSuppressionsRepo: { insertMany: mocks.insertManySuppression },
}));

import type { DbExec } from "@watchdog/db";

import { testId } from "../../../fixtures/ids.ts";
import { buildClaimCreateOp } from "../../../fixtures/patch.ts";
import { seedCase } from "../case";
import { seedEntity } from "../entity";
import { seedEvidence } from "../evidence";
import { seedGraphWrite } from "../graph-write";
import { seedIdentifier } from "../identifier";
import { seedJob } from "../job";
import { seedPlaybookRun } from "../playbook-run";
import { seedProposal } from "../proposal";
import { seedFindingSuppression } from "../suppression";

const exec = {} as DbExec;

describe("test-kit db seeds", () => {
  it("seedCase creates a case via casesRepo", async () => {
    mocks.createCase.mockResolvedValueOnce({
      id: "case-1",
      name: "Test Case",
      slug: "test-case",
    });
    const row = await seedCase(exec, { name: "My Case" });
    expect(row.id).toBe("case-1");
    expect(mocks.createCase).toHaveBeenCalledWith(
      exec,
      expect.objectContaining({ name: "My Case" })
    );
  });

  it("seedEntity creates an entity for a case", async () => {
    mocks.createEntity.mockResolvedValueOnce({
      id: "ent-1",
      caseId: "case-1",
      name: "Test Entity",
    });
    const row = await seedEntity(exec, "case-1");
    expect(row.id).toBe("ent-1");
    expect(mocks.createEntity).toHaveBeenCalled();
  });

  it("seedEvidence creates attestation evidence", async () => {
    mocks.createEvidence.mockResolvedValueOnce({
      id: "ev-1",
      caseId: "case-1",
      kind: "attestation",
    });
    const row = await seedEvidence(exec, "case-1");
    expect(row.kind).toBe("attestation");
    expect(mocks.createEvidence).toHaveBeenCalled();
  });

  it("seedGraphWrite inserts a graph write patch", async () => {
    mocks.createGraphWrite.mockResolvedValueOnce({ id: "gw-1" });
    const patch = [buildClaimCreateOp(testId(20), "observation")];
    const row = await seedGraphWrite(exec, "case-1", patch);
    expect(row.id).toBe("gw-1");
    expect(mocks.createGraphWrite).toHaveBeenCalledWith(
      exec,
      expect.objectContaining({ caseId: "case-1", patch })
    );
  });

  it("seedIdentifier creates typed identifier rows", async () => {
    mocks.createIdentifier.mockResolvedValueOnce({
      id: "id-1",
      type: "email",
      value: "a@b.com",
    });
    const row = await seedIdentifier(exec, "ent-1", {
      type: "email",
      value: "a@b.com",
    });
    expect(row.value).toBe("a@b.com");
    expect(mocks.createIdentifier).toHaveBeenCalled();
  });

  it("seedJob creates queued cap jobs", async () => {
    mocks.createJob.mockResolvedValueOnce({
      id: "job-1",
      capabilityId: "network.dns.lookup",
    });
    const row = await seedJob(exec, "case-1");
    expect(row.id).toBe("job-1");
    expect(mocks.createJob).toHaveBeenCalled();
  });

  it("seedPlaybookRun creates running playbook runs", async () => {
    mocks.createPlaybookRun.mockResolvedValueOnce({
      id: "run-1",
      playbookId: "url-capture",
    });
    const row = await seedPlaybookRun(exec, "case-1");
    expect(row.playbookId).toBe("url-capture");
    expect(mocks.createPlaybookRun).toHaveBeenCalled();
  });

  it("seedProposal inserts pending proposals", async () => {
    mocks.createProposal.mockResolvedValueOnce({ id: "prop-1" });
    const patch = [buildClaimCreateOp(testId(21), "claim text")];
    const row = await seedProposal(exec, "case-1", patch);
    expect(row.id).toBe("prop-1");
    expect(mocks.createProposal).toHaveBeenCalled();
  });

  it("seedProposal preserves explicit null summary", async () => {
    mocks.createProposal.mockResolvedValueOnce({ id: "prop-2" });
    await seedProposal(exec, "case-1", [], { summary: null });
    expect(mocks.createProposal).toHaveBeenCalledWith(
      exec,
      expect.objectContaining({ summary: null })
    );
  });

  it("seedFindingSuppression inserts suppression rows", async () => {
    mocks.insertManySuppression.mockResolvedValueOnce(undefined);
    await seedFindingSuppression(exec, {
      caseId: "case-1",
      fingerprint: "fp-1",
      reason: "rejected_fp",
      proposalId: "prop-1",
    });
    expect(mocks.insertManySuppression).toHaveBeenCalledWith(
      exec,
      expect.arrayContaining([expect.objectContaining({ fingerprint: "fp-1" })])
    );
  });
});

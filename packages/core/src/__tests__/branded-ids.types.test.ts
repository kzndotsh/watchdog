/**
 * Type test (ADR-0003): `pnpm typecheck` compiles this file, so every
 * `@ts-expect-error` below fails the build the day the call it marks starts to
 * compile. The calls are never run (the functions are not invoked); the runtime
 * assertions only keep vitest honest.
 */
import { describe, expect, it } from "vitest";

import { casesRepo, entitiesRepo } from "@watchdog/db";
import type { DbExec } from "@watchdog/db";
import {
  asCaseId,
  asOrganizationId,
  parseTrimmedCaseId,
  parseTrimmedUuid,
} from "@watchdog/schemas/shared";
import type { CaseId, OrganizationId } from "@watchdog/schemas/shared";
import { TEST_ORGANIZATION_ID, testCaseId } from "@watchdog/schemas/testing";

import { getCaseByIdEffect, listCasesEffect } from "../cases";
import type { CaseRecord } from "../cases";
import type { EvidenceRecord } from "../evidence";
import { assertCaseInOrgEffect } from "../graph";
import type { EntityRecord } from "../graph";
import type { JobRecord } from "../jobs";
import type { ProposalRecord } from "../proposals";
import type { TaskRecord } from "../tasks";

const caseId = testCaseId(1);
/** Type-level only: the repo calls below are never invoked. */
declare const exec: DbExec;

describe("branded ids: a swapped (organizationId, caseId) call does not compile", () => {
  it("getCaseByIdEffect takes (caseId, organizationId)", () => {
    const ok = () => getCaseByIdEffect(caseId, TEST_ORGANIZATION_ID);
    // @ts-expect-error an OrganizationId is not a CaseId, and a CaseId is not an OrganizationId
    const swapped = () => getCaseByIdEffect(TEST_ORGANIZATION_ID, caseId);
    expect([typeof ok, typeof swapped]).toEqual(["function", "function"]);
  });

  it("assertCaseInOrgEffect takes (caseId, organizationId)", () => {
    const ok = () => assertCaseInOrgEffect(caseId, TEST_ORGANIZATION_ID);
    // @ts-expect-error swapped ids
    const swapped = () => assertCaseInOrgEffect(TEST_ORGANIZATION_ID, caseId);
    expect([typeof ok, typeof swapped]).toEqual(["function", "function"]);
  });

  it("a plain string is neither id", () => {
    // @ts-expect-error a plain string is not an OrganizationId
    const org = () => listCasesEffect("org-1");
    // @ts-expect-error a plain string is not a CaseId
    const byId = () => getCaseByIdEffect("not-branded", TEST_ORGANIZATION_ID);
    expect([typeof org, typeof byId]).toEqual(["function", "function"]);
  });

  it("parseTrimmedUuid yields a plain string, parseTrimmedCaseId a CaseId", () => {
    const uuid = parseTrimmedUuid(caseId) ?? "";
    const parsedCase = parseTrimmedCaseId(caseId) ?? caseId;
    const okCase = () => getCaseByIdEffect(parsedCase, TEST_ORGANIZATION_ID);
    // @ts-expect-error a plain-string uuid (entity, job, evidence id) is not a CaseId
    const notCase = () => getCaseByIdEffect(uuid, TEST_ORGANIZATION_ID);
    expect([typeof okCase, typeof notCase]).toEqual(["function", "function"]);
  });

  it("a branded id is still a string", () => {
    const asString: string = caseId;
    const orgAsString: string = TEST_ORGANIZATION_ID;
    expect(asString).toBe(caseId);
    expect(orgAsString).toBe(TEST_ORGANIZATION_ID);
  });

  it("constructors mint the brands", () => {
    const minted: CaseId = asCaseId(caseId);
    const org: OrganizationId = asOrganizationId("org-1");
    // @ts-expect-error the two brands are distinct types
    const crossed: CaseId = org;
    expect(minted).toBe(caseId);
    expect(crossed).toBe("org-1");
  });
});

describe("branded ids: layers below core carry the brands (#165)", () => {
  it("db repos take a CaseId, not a plain string or an OrganizationId", () => {
    const ok = () => entitiesRepo.listForCase(exec, caseId);
    // @ts-expect-error a plain string is not a CaseId
    const plain = () => entitiesRepo.listForCase(exec, "not-branded");
    // @ts-expect-error an OrganizationId is not a CaseId
    const org = () => casesRepo.getByIdUnchecked(exec, TEST_ORGANIZATION_ID);
    expect([typeof ok, typeof plain, typeof org]).toEqual([
      "function",
      "function",
      "function",
    ]);
  });

  it("result records expose their Case id as a CaseId", () => {
    const ids = (records: {
      kase: CaseRecord;
      evidence: EvidenceRecord;
      entity: EntityRecord;
      job: JobRecord;
      proposal: ProposalRecord;
      task: TaskRecord;
    }): CaseId[] => [
      records.kase.id,
      records.evidence.caseId,
      records.entity.caseId,
      records.job.caseId,
      records.proposal.caseId,
      records.task.caseId,
    ];
    // @ts-expect-error a record's Case id is not an OrganizationId
    const crossed = (record: CaseRecord): OrganizationId => record.id;
    expect([typeof ids, typeof crossed]).toEqual(["function", "function"]);
  });
});

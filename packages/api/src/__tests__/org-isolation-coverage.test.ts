import { describe, expect, it } from "vitest";

import { SCOPES } from "@watchdog/schemas/shared";
import { TEST_ORGANIZATION_ID, testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit/fixtures";

import { router } from "../router";
import { foreignCaseAttacks } from "./org-isolation-case-attacks";
import { foreignChildAttacks } from "./org-isolation-child-attacks";
import {
  clientFor,
  declaredScope,
  procedureOf,
  procedurePaths,
} from "./org-isolation-fixtures";
import type { IsolationIds } from "./org-isolation-fixtures";

/**
 * Procedures that are deliberately not in the organization-isolation matrix
 * (`org-isolation.int.test.ts`), each with the reason it cannot leak another
 * organization's Case data. Adding a procedure to the router fails this file until it
 * is either attacked in `org-isolation-case-attacks.ts` or listed here with a reason.
 */
const NOT_IN_MATRIX: Readonly<Record<string, string>> = {
  health: "public liveness probe; reads no tenant data",
  ready:
    "public readiness probe; reports the database and object storage status only, reads no tenant data",
  "auth.whoami":
    "echoes the caller's own credential kind, key scopes and organization id; it takes no Case id and reads no Case data",
  "capabilities.list": "static Cap registry, identical for every organization",
  "capabilities.listPlaybooks":
    "static playbook registry, identical for every organization",
  "cases.list":
    "takes no Case id and filters by the actor's organization; the integration test 'lists only the caller's own Cases' asserts it",
  "cases.listDeleted":
    "takes no Case id and lists only the actor's own organization's deleted Cases (owner or admin); the integration test 'lists deleted Cases only for managers of the caller's own organization' asserts it",
  "cases.create":
    "takes no existing Case id; the new Case is stamped with the actor's organization",
  "organization.getSettings":
    "reads the actor's own organization settings; it takes no Case id and returns no Case data",
  "organization.updateSettings":
    "writes the actor's own organization settings (owner or admin only); it takes no Case id and touches no Case data",
  "organization.getJobStartLimits":
    "reads the actor's own organization's Job start limits and this window's counts (and the calling key's); it takes no Case id and returns no Case data",
  "organization.setJobStartLimit":
    "writes the actor's own organization's limit, or the limit of an API key issued for it (a key of another organization is not_found); it takes no Case id and touches no Case data",
  "credentials.list":
    "vault slots are keyed by the actor's user id and hold no Case data",
  "credentials.put":
    "vault slots are keyed by the actor's user id and hold no Case data",
  "credentials.delete":
    "vault slots are keyed by the actor's user id and hold no Case data",
};

const ids: IsolationIds = {
  caseA: testCaseId(1),
  caseB: testCaseId(2),
  caseSlugA: "org-a-case",
  entityA: testId(10),
  entityA2: testId(11),
  entityB: testId(20),
  claimA: testId(30),
  identifierA: testId(31),
  edgeA: testId(32),
  eventA: testId(33),
  questionA: testId(34),
  taskA: testId(35),
  evidenceA: testId(36),
  jobA: testId(37),
  proposalA: testId(38),
  playbookRunA: testId(39),
};

describe("organization isolation matrix coverage", () => {
  const procedures = procedurePaths(router);
  // Building the attack lists only names the calls; nothing is invoked here.
  const attacker = clientFor(TEST_ORGANIZATION_ID, "cov-attacker");
  const attacked = new Set(
    foreignCaseAttacks(attacker, ids).map(([name]) => procedureOf(name))
  );
  const smuggled = new Set(
    foreignChildAttacks(attacker, ids).map(([name]) => procedureOf(name))
  );

  it("fails when a procedure declares no scope (API keys, #367)", () => {
    const valid = new Set<unknown>([...SCOPES, "session", "public"]);
    const undeclared = procedures.filter(
      (path) => !valid.has(declaredScope(router, path))
    );
    expect(
      undeclared,
      `declare .meta({ scope }) on: ${undeclared.join(", ")}`
    ).toEqual([]);
  });

  it("keeps the public probes the only public procedures", () => {
    const open = procedures.filter(
      (path) => declaredScope(router, path) === "public"
    );
    expect(open.sort()).toEqual(["health", "ready"]);
  });

  it("finds the router's procedures", () => {
    expect(procedures).toContain("cases.get");
    expect(procedures).toContain("graph.write");
    expect(procedures).toContain("health");
    expect(procedures.length).toBeGreaterThan(50);
  });

  it("attacks every procedure with a foreign Case, or lists it with a reason", () => {
    const unaccounted = procedures.filter(
      (path) => !attacked.has(path) && !(path in NOT_IN_MATRIX)
    );
    expect(
      unaccounted,
      `add to org-isolation-case-attacks.ts, or to NOT_IN_MATRIX with a reason: ${unaccounted.join(", ")}`
    ).toEqual([]);
  });

  it("keeps every allowlist entry real, reasoned and unattacked", () => {
    for (const [path, reason] of Object.entries(NOT_IN_MATRIX)) {
      expect(procedures, `${path} is not a router procedure`).toContain(path);
      expect(reason.trim().length, `${path} has no reason`).toBeGreaterThan(20);
      expect(
        attacked.has(path),
        `${path} is attacked, drop the allowlist entry`
      ).toBe(false);
    }
  });

  it("names only router procedures in the attack lists", () => {
    const unknown = [...attacked, ...smuggled].filter(
      (path) => !procedures.includes(path)
    );
    expect(unknown).toEqual([]);
  });
});

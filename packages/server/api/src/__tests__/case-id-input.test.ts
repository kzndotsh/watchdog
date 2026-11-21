import { isProcedure } from "@orpc/server";
import { describe, expect, it } from "vitest";

import { router } from "../router";
import { procedurePaths } from "./org-isolation-fixtures";

/**
 * Procedures that are not scoped to one Case, each with the reason. Every other procedure is
 * Case-scoped and must take `caseId` at the top level of its input: the web client's Query keys
 * are `[path, { input }]`, and a Case's caches are invalidated by the partial key
 * `{ input: { caseId } }`, which matches only a top-level `caseId`.
 */
const NOT_CASE_SCOPED: Readonly<Record<string, string>> = {
  health: "public liveness probe; reads no Case",
  ready: "public readiness probe; reads no Case",
  "auth.whoami": "echoes the caller's own credential; reads no Case",
  "capabilities.list": "static Cap registry, the same for every Case",
  "capabilities.listPlaybooks":
    "static playbook registry, the same for every Case",
  "cases.list": "lists the organization's Cases; no one Case",
  "cases.listDeleted": "lists the organization's deleted Cases; no one Case",
  "cases.create": "creates a Case, so there is no Case id yet",
  "cases.getBySlug":
    "resolves a Case URL's slug to the Case, before its id is known",
  "cases.getDeletedBySlug":
    "resolves a deleted Case's slug to the Case, before its id is known",
  "organization.getSettings": "the organization's own settings; no Case",
  "organization.updateSettings": "the organization's own settings; no Case",
  "organization.getJobStartLimits": "the organization's own limits; no Case",
  "organization.setJobStartLimit": "the organization's own limits; no Case",
  "credentials.list": "vault slots are per user, not per Case",
  "credentials.put": "vault slots are per user, not per Case",
  "credentials.delete": "vault slots are per user, not per Case",
};

type ZodLike = {
  _zod?: { def?: { type?: string; in?: unknown } };
  shape?: Record<string, unknown>;
};

/** The keys of an input schema's top-level object (through a `pipe`), or `[]` when none. */
function topLevelKeys(schema: unknown): string[] {
  const zod = schema as ZodLike | undefined;
  const def = zod?._zod?.def;
  if (def?.type === "pipe") return topLevelKeys(def.in);
  if (def?.type === "object" && zod?.shape !== undefined) {
    return Object.keys(zod.shape);
  }
  return [];
}

function inputSchemaOf(path: string): unknown {
  let current: unknown = router;
  for (const key of path.split(".")) {
    current =
      typeof current === "object" && current !== null
        ? Reflect.get(current, key)
        : undefined;
  }
  return isProcedure(current) ? current["~orpc"].inputSchema : undefined;
}

describe("Case-scoped procedure inputs", () => {
  const procedures = procedurePaths(router);

  it("take the Case id at the top level of their input", () => {
    const missing = procedures.filter(
      (path) =>
        !(path in NOT_CASE_SCOPED) &&
        !topLevelKeys(inputSchemaOf(path)).includes("caseId")
    );
    expect(
      missing,
      `put caseId at the top level of the input, or list the procedure in NOT_CASE_SCOPED with a reason: ${missing.join(", ")}`
    ).toEqual([]);
  });

  it("keeps every exception a real procedure without a top-level Case id", () => {
    for (const path of Object.keys(NOT_CASE_SCOPED)) {
      expect(procedures, `${path} is not a router procedure`).toContain(path);
      expect(
        topLevelKeys(inputSchemaOf(path)),
        `${path} takes caseId: drop it from NOT_CASE_SCOPED`
      ).not.toContain("caseId");
    }
  });
});

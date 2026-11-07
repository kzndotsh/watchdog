import { describe, expect, it, vi } from "vitest";

import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

import { requireCaseId, resolveEntityId, resolveEntitySlug } from "../ids";
import { API_URL, queryIds, standInApi } from "./stand-in-api";

// A developer `.env` above the checkout would otherwise be loaded into process.env.
vi.mock("dotenv", () => ({ config: vi.fn() }));

const standIn = standInApi();

function entity(id: string, slug: string, name: string) {
  return { id, slug, name, kind: "org", summary: null, notes: null };
}

describe("resolveEntityId / resolveEntitySlug", () => {
  it("slugifies a display name and reads the Entity by slug", async () => {
    const caseId = testCaseId(1);
    const entityId = testId(2);
    standIn.json(
      "get",
      `/cases/${caseId}/entities/alpha-corp`,
      entity(entityId, "alpha-corp", "Alpha Corp")
    );

    const id = await resolveEntityId(caseId, "  Alpha Corp  ");
    const slug = await resolveEntitySlug(caseId, "Alpha Corp");

    expect(id).toBe(entityId);
    expect(slug).toBe("alpha-corp");
  });

  it("resolves an Entity uuid by id, never through the slug route", async () => {
    const caseId = testCaseId(3);
    const entityId = testId(4);
    standIn.json("get", `/cases/${caseId}/entities-by-ids`, [
      entity(entityId, "beta-llc", "Beta LLC"),
    ]);

    const id = await resolveEntityId(caseId, `  ${entityId}  `);

    expect(id).toBe(entityId);
    expect(standIn.seen.map((r) => r.path)).toEqual([
      `/cases/${caseId}/entities-by-ids`,
    ]);
    expect(queryIds(standIn.seen[0]?.url ?? new URL(API_URL))).toEqual([
      entityId,
    ]);
  });

  it("accepts a padded case id", async () => {
    const caseId = testCaseId(5);
    const entityId = testId(6);
    standIn.json("get", `/cases/${caseId}/entities-by-ids`, [
      entity(entityId, "gamma", "Gamma"),
    ]);

    const id = await resolveEntityId(requireCaseId(`  ${caseId}  `), entityId);

    expect(id).toBe(entityId);
    expect(standIn.seen[0]?.path).toBe(`/cases/${caseId}/entities-by-ids`);
  });
});

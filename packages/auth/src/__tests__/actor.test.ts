import { describe, expect, it, vi } from "vitest";

import { asOrganizationId } from "@watchdog/schemas/shared";

const dbClient = vi.hoisted(() => ({}));
const resolveUserOrganizationId = vi.hoisted(() => vi.fn());

vi.mock("@watchdog/db", () => ({
  db: dbClient,
  resolveUserOrganizationId,
}));

import { resolveActorOrganizationId } from "../actor";

describe("resolveActorOrganizationId (the one organization-id mint)", () => {
  it("passes a non-blank preferred id to the database lookup as an OrganizationId", async () => {
    const resolved = asOrganizationId("org-1");
    resolveUserOrganizationId.mockResolvedValueOnce(resolved);

    await expect(resolveActorOrganizationId("user-1", "org-1")).resolves.toBe(
      resolved
    );
    expect(resolveUserOrganizationId).toHaveBeenCalledWith(
      dbClient,
      "user-1",
      "org-1"
    );
  });

  it.each([undefined, null, ""])(
    "treats a blank preferred id (%j) as absent",
    async (preferred) => {
      resolveUserOrganizationId.mockResolvedValueOnce(null);

      await expect(
        resolveActorOrganizationId("user-1", preferred)
      ).resolves.toBeNull();
      expect(resolveUserOrganizationId).toHaveBeenLastCalledWith(
        dbClient,
        "user-1",
        null
      );
    }
  );
});

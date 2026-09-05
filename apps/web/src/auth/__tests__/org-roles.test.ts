import { describe, expect, it } from "vitest";

import { canManageTeam } from "@/auth/org-roles";

describe("canManageTeam", () => {
  it("allows owner and admin", () => {
    expect(canManageTeam("owner")).toBe(true);
    expect(canManageTeam("admin")).toBe(true);
    expect(canManageTeam("owner,admin")).toBe(true);
  });

  it("denies member", () => {
    expect(canManageTeam("member")).toBe(false);
    expect(canManageTeam("")).toBe(false);
  });
});

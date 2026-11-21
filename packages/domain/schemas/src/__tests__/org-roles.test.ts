import { describe, expect, it } from "vitest";

import { canManageTeam, isInstanceAdminRole } from "../org-roles";

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

describe("isInstanceAdminRole", () => {
  it("matches the Better Auth user.role admin token", () => {
    expect(isInstanceAdminRole("admin")).toBe(true);
    expect(isInstanceAdminRole("admin,user")).toBe(true);
    expect(isInstanceAdminRole("user")).toBe(false);
    expect(isInstanceAdminRole("")).toBe(false);
    expect(isInstanceAdminRole(null)).toBe(false);
    expect(isInstanceAdminRole(undefined)).toBe(false);
  });
});

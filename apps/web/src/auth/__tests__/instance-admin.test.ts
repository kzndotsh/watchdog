import { describe, expect, it } from "vitest";

import { instanceAdminAccess, isInstanceAdmin } from "@/auth/instance-admin";

describe("isInstanceAdmin", () => {
  it("matches the Better Auth user.role admin token", () => {
    expect(isInstanceAdmin("admin")).toBe(true);
    expect(isInstanceAdmin("admin,user")).toBe(true);
    expect(isInstanceAdmin("user")).toBe(false);
    expect(isInstanceAdmin("")).toBe(false);
    expect(isInstanceAdmin(null)).toBe(false);
  });
});

describe("instanceAdminAccess", () => {
  it("does not grant impersonate", () => {
    expect(instanceAdminAccess.roles.admin.statements.user).not.toContain(
      "impersonate"
    );
    expect(instanceAdminAccess.roles.admin.statements.user).not.toContain(
      "impersonate-admins"
    );
    expect(instanceAdminAccess.roles.user.statements.user).toEqual([]);
  });
});

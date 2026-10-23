import { describe, expect, it } from "vitest";

import { instanceAdminAccess } from "../instance-admin";

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

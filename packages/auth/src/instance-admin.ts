import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";

const INSTANCE_ADMIN_USER_PERMS = [
  "create",
  "list",
  "set-role",
  "ban",
  "delete",
  "set-password",
  "set-email",
  "get",
  "update",
] as const;

const ac = createAccessControl(defaultStatements);

export const instanceAdminAccess = {
  ac,
  roles: {
    admin: ac.newRole({
      user: [...INSTANCE_ADMIN_USER_PERMS],
      session: ["list", "revoke", "delete"],
    }),
    user: ac.newRole({
      user: [],
      session: [],
    }),
  },
};

export const DISABLED_ACCOUNT_MESSAGE = "This account is disabled.";

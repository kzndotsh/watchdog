import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";

/** Better Auth `auth.user.role`. Not organization member role. */
export const INSTANCE_ADMIN_ROLE = "admin";

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

export function isInstanceAdmin(role: string | null | undefined): boolean {
  return (role ?? "")
    .split(",")
    .some((part) => part.trim() === INSTANCE_ADMIN_ROLE);
}

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

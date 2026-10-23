const MANAGER_ROLES = new Set(["owner", "admin"]);

/** Whether a Better Auth member role (possibly comma-separated) may manage the organization. */
export function canManageTeam(role: string): boolean {
  return role.split(",").some((part) => MANAGER_ROLES.has(part.trim()));
}

/** Better Auth `auth.user.role` of an instance admin (not an organization member role). */
const INSTANCE_ADMIN_ROLE = "admin";

/** Whether a user's Better Auth role (possibly comma-separated) makes them an instance admin. */
export function isInstanceAdminRole(role: string | null | undefined): boolean {
  return (role ?? "")
    .split(",")
    .some((part) => part.trim() === INSTANCE_ADMIN_ROLE);
}

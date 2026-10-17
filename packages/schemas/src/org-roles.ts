const MANAGER_ROLES = new Set(["owner", "admin"]);

/** Whether a Better Auth member role (possibly comma-separated) may manage the organization. */
export function canManageTeam(role: string): boolean {
  return role.split(",").some((part) => MANAGER_ROLES.has(part.trim()));
}

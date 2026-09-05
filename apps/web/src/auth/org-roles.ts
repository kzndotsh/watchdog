const MANAGER_ROLES = new Set(["owner", "admin"]);

export function canManageTeam(role: string): boolean {
  return role.split(",").some((part) => MANAGER_ROLES.has(part.trim()));
}

export const INVITE_ROLE_OPTIONS = [
  { value: "member", label: "Member" },
  { value: "admin", label: "Admin" },
] as const;

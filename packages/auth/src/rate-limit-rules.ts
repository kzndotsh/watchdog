/** A Better Auth rate-limit rule: at most `max` requests per IP in `window` seconds. */
export type RateLimitRule = { readonly window: number; readonly max: number };

/**
 * Better Auth `rateLimit.customRules`. It applies them in production only, per IP, in memory;
 * paths not listed keep its defaults (sign-in and password flows are already throttled).
 * Every path that creates an account or reads invitation details is listed: a missing one
 * fails `rate-limit-rules.test.ts` (`needsExplicitRateLimit`).
 */
export const AUTH_RATE_LIMIT_RULES: Readonly<Record<string, RateLimitRule>> = {
  // Account creation.
  "/sign-up/email": { window: 60 * 60, max: 10 },
  "/organization/invite-sign-up": { window: 60 * 60, max: 10 },
  "/admin/create-user": { window: 60 * 60, max: 20 },
  // Invitation details. The preview answers without a session, by invitation id.
  "/organization/invitation-preview": { window: 60, max: 20 },
  "/organization/get-invitation": { window: 60, max: 30 },
  "/organization/list-invitations": { window: 60, max: 30 },
  "/organization/list-user-invitations": { window: 60, max: 30 },
  // Organization and membership changes.
  "/organization/create": { window: 60 * 60, max: 5 },
  "/organization/delete": { window: 60 * 60, max: 5 },
  "/organization/update-member-role": { window: 60, max: 10 },
  "/organization/remove-member": { window: 60, max: 20 },
  "/organization/invite-member": { window: 60, max: 20 },
};

/**
 * Whether an auth endpoint creates an account or reads invitation details, so it must carry
 * an explicit rule: a sign-up of any kind, an admin user create, or an invitation read
 * (get, list, preview).
 */
export function needsExplicitRateLimit(path: string): boolean {
  const last = path.split("/").at(-1) ?? "";
  if (path.includes("sign-up") || last === "create-user") return true;
  return (
    last.includes("invitation") &&
    (last.startsWith("get-") ||
      last.startsWith("list-") ||
      last.includes("preview"))
  );
}

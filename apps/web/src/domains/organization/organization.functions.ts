import { createServerFn } from "@tanstack/react-start";

/**
 * The organization the caller acts in (session's active org, else their oldest
 * membership). `null` = signed in but in no organization yet → onboarding.
 */
export const getOrganizationStateFn = createServerFn({
  method: "GET",
}).handler(({ context }): { organizationId: string | null } => ({
  organizationId: context.organizationId,
}));

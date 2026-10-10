import { queryOptions } from "@tanstack/react-query";

import { authClient } from "@/auth/client";
import { getOrganizationStateFn } from "@/domains/organization/organization.functions";

export const organizationKeys = {
  state: () => ["organization", "state"] as const,
  /** Members and pending invitations of the active organization. */
  team: () => ["auth-org", "team"] as const,
  /** Invitations addressed to the signed-in user. */
  userInvitations: () => ["auth-org", "user-invitations"] as const,
  /** The signed-in user's role in the organization. */
  memberRole: (organizationId: string | undefined) =>
    ["organization", "member-role", organizationId] as const,
  /** One slug's availability answer. */
  slugAvailability: (slug: string) =>
    ["auth-org", "slug-availability", slug] as const,
  invitationPreview: (invitationId: string) =>
    ["invitation-preview", invitationId] as const,
};

/** Fresh on every route entry: the answer changes when the user creates or joins an org. */
export const organizationStateQuery = () =>
  queryOptions({
    queryKey: organizationKeys.state(),
    queryFn: async () => getOrganizationStateFn(),
    staleTime: 0,
  });

const SLUG_TAKEN_CODE = "ORGANIZATION_SLUG_ALREADY_TAKEN";

/**
 * `true` when the server says the slug is taken. Any other failure (5xx, rate limit,
 * transport) throws, so the slug is neither taken nor free: the server decides at submit.
 */
export const slugTakenQuery = (slug: string) =>
  queryOptions({
    queryKey: organizationKeys.slugAvailability(slug),
    queryFn: async () => {
      const { error } = await authClient.organization.checkSlug({ slug });
      if (!error) return false;
      if (error.code === SLUG_TAKEN_CODE) return true;
      throw new Error(error.message ?? "Couldn't check the slug");
    },
    // An availability answer is only true now: never serve it from cache.
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

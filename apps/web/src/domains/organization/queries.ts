import { ORPCError } from "@orpc/client";
import { queryOptions } from "@tanstack/react-query";

import { authClient } from "@/auth/client";
import { orpc } from "@/lib/orpc-client";
import { couldnt } from "@/lib/utils";
import { STALE_STABLE } from "@/shared/lib/query-stale";

export const organizationKeys = {
  /** Every organization read: state, settings, team, invitations, availability. */
  all: ["organization"] as const,
  /** Every user's organization state (the invalidation prefix). */
  stateAll: () => ["organization", "state"] as const,
  /** One user's organization state: a second account on the same tab never sees it. */
  state: (userId: string) => ["organization", "state", userId] as const,
  /** The active organization's settings (Open in switch). */
  settings: () => ["organization", "settings"] as const,
  /** Members and pending invitations of the active organization. */
  team: () => ["organization", "team"] as const,
  /** Invitations addressed to the signed-in user. */
  userInvitations: () => ["organization", "user-invitations"] as const,
  /** The signed-in user's role in the organization. */
  memberRole: (organizationId: string | undefined) =>
    ["organization", "member-role", organizationId] as const,
  /** One slug's availability answer. */
  slugAvailability: (slug: string) =>
    ["organization", "slug-availability", slug] as const,
  invitationPreview: (invitationId: string) =>
    ["organization", "invitation-preview", invitationId] as const,
};

/**
 * The organization the caller acts in, as the API resolves it for this request (the session's
 * active organization, else their oldest membership): `auth.whoami`. A session in no
 * organization is refused with a bare `FORBIDDEN` before the procedure runs, which is the
 * `null` answer (onboarding). Any other failure is the query's error.
 */
async function fetchOrganizationState(): Promise<{
  organizationId: string | null;
}> {
  try {
    const { organizationId } = await orpc.auth.whoami.call();
    return { organizationId };
  } catch (error) {
    if (error instanceof ORPCError && error.code === "FORBIDDEN") {
      return { organizationId: null };
    }
    throw error;
  }
}

/**
 * Cached until an organization change invalidates it (`invalidateAfterOrganizationChange`:
 * create, switch, join, leave, delete, remove member). The answer only changes through those
 * mutations, so the route guard does not re-ask on every navigation.
 */
export const organizationStateQuery = (userId: string) =>
  queryOptions({
    queryKey: organizationKeys.state(userId),
    queryFn: async () => fetchOrganizationState(),
    staleTime: Infinity,
    gcTime: Infinity,
  });

/** The active organization's settings; changes only through `useUpdateOrganizationSettings`. */
export const organizationSettingsQuery = () =>
  queryOptions({
    queryKey: organizationKeys.settings(),
    queryFn: async () => orpc.organization.getSettings.call(),
    staleTime: STALE_STABLE,
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
      throw new Error(error.message ?? couldnt("check", "the slug"));
    },
    // An availability answer is only true now: never serve it from cache.
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

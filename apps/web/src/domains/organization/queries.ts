import { queryOptions } from "@tanstack/react-query";

import { authClient } from "@/auth/client";
import { getOrganizationSettingsFn } from "@/domains/organization/organization-settings.functions";
import { getOrganizationStateFn } from "@/domains/organization/organization.functions";
import { couldnt } from "@/lib/utils";
import { STALE_STABLE } from "@/shared/lib/query-stale";

export const organizationKeys = {
  /** Every user's organization state (the invalidation prefix). */
  stateAll: () => ["organization", "state"] as const,
  /** One user's organization state: a second account on the same tab never sees it. */
  state: (userId: string) => ["organization", "state", userId] as const,
  /** The active organization's settings (external AI handoff switch). */
  settings: () => ["organization", "settings"] as const,
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

/**
 * Cached until an organization change invalidates it (`invalidateAfterOrganizationChange`:
 * create, switch, join, leave, delete, remove member). The answer only changes through those
 * mutations, so the route guard does not re-ask on every navigation.
 */
export const organizationStateQuery = (userId: string) =>
  queryOptions({
    queryKey: organizationKeys.state(userId),
    queryFn: async () => getOrganizationStateFn(),
    staleTime: Infinity,
    gcTime: Infinity,
  });

/** The active organization's settings; changes only through `useUpdateOrganizationSettings`. */
export const organizationSettingsQuery = () =>
  queryOptions({
    queryKey: organizationKeys.settings(),
    queryFn: async () => getOrganizationSettingsFn(),
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

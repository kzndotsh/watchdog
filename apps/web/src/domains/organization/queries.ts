import { queryOptions } from "@tanstack/react-query";

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

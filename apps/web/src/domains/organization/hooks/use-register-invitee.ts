import { useMutation } from "@tanstack/react-query";

import { inviteSignUp } from "@/auth/invitation-api";
import { useReloadIntoOrganization } from "@/domains/organization/hooks/use-reload-into-organization";

export type RegisterInviteeVariables = {
  invitationId: string;
  name: string;
  password: string;
};

/**
 * Create an account from an invitation. On success the hook hard-navigates into the joined
 * organization; the caller shows the error from the returned mutation.
 */
export function useRegisterInvitee() {
  const reloadIntoOrganization = useReloadIntoOrganization();
  return useMutation({
    mutationFn: async (input: RegisterInviteeVariables) => inviteSignUp(input),
    onSuccess: reloadIntoOrganization,
  });
}

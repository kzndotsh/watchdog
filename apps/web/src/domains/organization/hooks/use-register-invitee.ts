import { useMutation } from "@tanstack/react-query";

import { inviteSignUp } from "@/auth/invitation-api";

export interface RegisterInviteeVariables {
  invitationId: string;
  name: string;
  password: string;
}

/**
 * Create an account from an invitation. The caller shows the error from the returned
 * mutation and navigates in `onRegistered`.
 */
export function useRegisterInvitee({
  onRegistered,
}: { onRegistered?: () => void } = {}) {
  return useMutation({
    mutationFn: async (input: RegisterInviteeVariables) => inviteSignUp(input),
    onSuccess: () => {
      onRegistered?.();
    },
  });
}

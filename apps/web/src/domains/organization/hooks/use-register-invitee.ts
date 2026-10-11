import { useMutation } from "@tanstack/react-query";

import { inviteSignUp } from "@/auth/invitation-api";

export type RegisterInviteeVariables = {
  invitationId: string;
  name: string;
  password: string;
};

/**
 * Create an account from an invitation. The caller shows the error from the returned
 * mutation and navigates in `onRegistered`.
 */
export function useRegisterInvitee({
  onRegistered,
}: { onRegistered?: () => void } = {}) {
  // oxlint-disable-next-line react-doctor/query-mutation-missing-invalidation -- the caller hard-navigates to "/" on success, which discards every cache; there is no mounted screen left to go stale
  return useMutation({
    mutationFn: async (input: RegisterInviteeVariables) => inviteSignUp(input),
    onSuccess: () => {
      onRegistered?.();
    },
  });
}

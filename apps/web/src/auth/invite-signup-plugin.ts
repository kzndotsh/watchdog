import { invitationPreviewEndpoint } from "@/auth/invitation-preview-endpoint";
import { inviteSignUpEndpoint } from "@/auth/invite-sign-up-endpoint";

export function inviteSignupPlugin() {
  return {
    id: "invite-signup",
    endpoints: {
      invitationPreview: invitationPreviewEndpoint,
      inviteSignUp: inviteSignUpEndpoint,
    },
  };
}

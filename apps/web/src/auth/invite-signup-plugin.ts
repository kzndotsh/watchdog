import { invitationPreviewEndpoint } from "@/auth/invitation-preview-endpoint";
import { inviteSignUpEndpoint } from "@/auth/invite-signup-endpoint";

export function inviteSignupPlugin() {
  return {
    id: "invite-signup",
    endpoints: {
      invitationPreview: invitationPreviewEndpoint,
      inviteSignUp: inviteSignUpEndpoint,
    },
  };
}

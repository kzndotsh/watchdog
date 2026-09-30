import { invitationPreviewEndpoint } from "./invitation-preview-endpoint";
import { inviteSignUpEndpoint } from "./invite-signup-endpoint";

export function inviteSignupPlugin() {
  return {
    id: "invite-signup",
    endpoints: {
      invitationPreview: invitationPreviewEndpoint,
      inviteSignUp: inviteSignUpEndpoint,
    },
  };
}

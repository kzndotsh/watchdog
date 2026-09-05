import { createAuthEndpoint, formCsrfMiddleware } from "better-auth/api";
import { getOrgAdapter } from "better-auth/plugins";

import {
  acceptInvitationMembership,
  assertNoExistingSession,
  createCredentialUser,
  establishInviteSession,
} from "@/auth/invite-sign-up-flow";
import {
  assertPasswordLength,
  requirePendingInvitation,
} from "@/auth/invite-signup-helpers";
import { inviteSignUpBody } from "@/auth/invite-signup-schemas";

export const inviteSignUpEndpoint = createAuthEndpoint(
  "/organization/invite-sign-up",
  {
    method: "POST",
    body: inviteSignUpBody,
    requireHeaders: true,
    use: [formCsrfMiddleware],
  },
  async (ctx) => {
    await assertNoExistingSession(ctx);

    const adapter = getOrgAdapter(ctx.context);
    const invitation = await requirePendingInvitation(
      adapter,
      ctx.body.invitationId
    );

    assertPasswordLength(ctx.body.password, ctx.context.password.config);

    const email = invitation.email.toLowerCase();
    const createdUser = await createCredentialUser(ctx, {
      email,
      name: ctx.body.name,
      password: ctx.body.password,
    });

    await acceptInvitationMembership(adapter, invitation, createdUser.id);
    await establishInviteSession(ctx, adapter, {
      user: createdUser,
      organizationId: invitation.organizationId,
    });

    return ctx.json({ user: { id: createdUser.id, email } });
  }
);

import { createAuthEndpoint } from "better-auth/api";
import { getOrgAdapter } from "better-auth/plugins";

import {
  requirePendingInvitation,
  throwInvitationNotFound,
} from "@/auth/invite-signup-helpers";
import { invitationPreviewSchema } from "@/auth/invite-signup-schemas";

export const invitationPreviewEndpoint = createAuthEndpoint(
  "/organization/invitation-preview",
  {
    method: "GET",
    query: invitationPreviewSchema,
  },
  async (ctx) => {
    const adapter = getOrgAdapter(ctx.context);
    const invitation = await requirePendingInvitation(adapter, ctx.query.id);
    const organization = await adapter.findOrganizationById(
      invitation.organizationId
    );
    if (!organization) {
      throwInvitationNotFound();
    }
    return ctx.json({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      organizationName: organization.name,
    });
  }
);

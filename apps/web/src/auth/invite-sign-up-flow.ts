import type { GenericEndpointContext } from "better-auth";
import { APIError, getSessionFromCtx } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { createLocalAccountIssuer } from "better-auth/db";
import type { getOrgAdapter } from "better-auth/plugins";

import {
  type PendingInvitation,
  throwInvitationNotFound,
} from "@/auth/invite-signup-helpers";

type OrgAdapter = ReturnType<typeof getOrgAdapter>;

type CreatedUser = NonNullable<
  Awaited<
    ReturnType<
      GenericEndpointContext["context"]["internalAdapter"]["createUser"]
    >
  >
>;

export async function assertNoExistingSession(
  ctx: GenericEndpointContext
): Promise<void> {
  const existingSession = await getSessionFromCtx(ctx);
  if (existingSession) {
    throw APIError.from("BAD_REQUEST", {
      message: "Already signed in",
      code: "ALREADY_SIGNED_IN",
    });
  }
}

export async function createCredentialUser(
  ctx: GenericEndpointContext,
  input: { email: string; name: string; password: string }
): Promise<CreatedUser> {
  if (await ctx.context.internalAdapter.findUserByEmail(input.email)) {
    throw APIError.from("BAD_REQUEST", {
      message:
        "An account with this email already exists. Sign in to accept the invitation.",
      code: "USER_ALREADY_EXISTS",
    });
  }

  const hash = await ctx.context.password.hash(input.password);
  const createdUser = await ctx.context.internalAdapter.createUser(
    {
      email: input.email,
      name: input.name,
      emailVerified: false,
    },
    { method: "email-password" }
  );
  if (!createdUser) {
    throw APIError.from("BAD_REQUEST", {
      message: "Failed to create user",
      code: "FAILED_TO_CREATE_USER",
    });
  }

  await ctx.context.internalAdapter.linkAccount({
    userId: createdUser.id,
    providerId: "credential",
    issuer: createLocalAccountIssuer("credential"),
    accountId: createdUser.id,
    password: hash,
  });

  return createdUser;
}

export async function acceptInvitationMembership(
  adapter: OrgAdapter,
  invitation: PendingInvitation,
  userId: string
): Promise<void> {
  const accepted = await adapter.updateInvitation({
    invitationId: invitation.id,
    status: "accepted",
    fromStatus: "pending",
  });
  if (!accepted) {
    throwInvitationNotFound();
  }

  await adapter.createMember({
    organizationId: invitation.organizationId,
    userId,
    role: invitation.role,
    createdAt: new Date(),
  });
}

export async function establishInviteSession(
  ctx: GenericEndpointContext,
  adapter: OrgAdapter,
  input: {
    user: CreatedUser;
    organizationId: string;
  }
): Promise<void> {
  const session = await ctx.context.internalAdapter.createSession(
    input.user.id
  );
  if (!session) {
    throw APIError.from("BAD_REQUEST", {
      message: "Failed to create session",
      code: "FAILED_TO_CREATE_SESSION",
    });
  }

  const activeSession =
    (await adapter.setActiveOrganization(
      session.token,
      input.organizationId,
      ctx
    )) ?? session;
  await setSessionCookie(ctx, {
    session: activeSession,
    user: input.user,
  });
}

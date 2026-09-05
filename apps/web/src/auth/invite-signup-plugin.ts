import {
  APIError,
  createAuthEndpoint,
  formCsrfMiddleware,
  getSessionFromCtx,
} from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { createLocalAccountIssuer } from "better-auth/db";
import { getOrgAdapter } from "better-auth/plugins";
import { z } from "zod";

const invitationPreviewQuery = z.object({
  id: z.uuid(),
});

const inviteSignUpBody = z.object({
  invitationId: z.uuid(),
  name: z.string().trim().min(1),
  password: z.string().min(1),
});

export function inviteSignupPlugin() {
  return {
    id: "invite-signup",
    endpoints: {
      invitationPreview: createAuthEndpoint(
        "/organization/invitation-preview",
        {
          method: "GET",
          query: invitationPreviewQuery,
        },
        async (ctx) => {
          const adapter = getOrgAdapter(ctx.context);
          const invitation = await adapter.findInvitationById(ctx.query.id);
          if (
            !invitation ||
            invitation.status !== "pending" ||
            invitation.expiresAt < new Date()
          ) {
            throw APIError.from("BAD_REQUEST", {
              message: "Invitation not found",
              code: "INVITATION_NOT_FOUND",
            });
          }
          const organization = await adapter.findOrganizationById(
            invitation.organizationId
          );
          if (!organization) {
            throw APIError.from("BAD_REQUEST", {
              message: "Invitation not found",
              code: "INVITATION_NOT_FOUND",
            });
          }
          return ctx.json({
            id: invitation.id,
            email: invitation.email,
            role: invitation.role,
            organizationName: organization.name,
          });
        }
      ),
      inviteSignUp: createAuthEndpoint(
        "/organization/invite-sign-up",
        {
          method: "POST",
          body: inviteSignUpBody,
          requireHeaders: true,
          use: [formCsrfMiddleware],
        },
        async (ctx) => {
          const existingSession = await getSessionFromCtx(ctx);
          if (existingSession) {
            throw APIError.from("BAD_REQUEST", {
              message: "Already signed in",
              code: "ALREADY_SIGNED_IN",
            });
          }

          const adapter = getOrgAdapter(ctx.context);
          const invitation = await adapter.findInvitationById(
            ctx.body.invitationId
          );
          if (
            !invitation ||
            invitation.status !== "pending" ||
            invitation.expiresAt < new Date()
          ) {
            throw APIError.from("BAD_REQUEST", {
              message: "Invitation not found",
              code: "INVITATION_NOT_FOUND",
            });
          }

          const password = ctx.body.password;
          const minPasswordLength =
            ctx.context.password.config.minPasswordLength;
          const maxPasswordLength =
            ctx.context.password.config.maxPasswordLength;
          if (password.length < minPasswordLength) {
            throw APIError.from("BAD_REQUEST", {
              message: "Password is too short",
              code: "PASSWORD_TOO_SHORT",
            });
          }
          if (password.length > maxPasswordLength) {
            throw APIError.from("BAD_REQUEST", {
              message: "Password is too long",
              code: "PASSWORD_TOO_LONG",
            });
          }

          const email = invitation.email.toLowerCase();
          if (await ctx.context.internalAdapter.findUserByEmail(email)) {
            throw APIError.from("BAD_REQUEST", {
              message:
                "An account with this email already exists. Sign in to accept the invitation.",
              code: "USER_ALREADY_EXISTS",
            });
          }

          const hash = await ctx.context.password.hash(password);
          const createdUser = await ctx.context.internalAdapter.createUser(
            {
              email,
              name: ctx.body.name,
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

          const accepted = await adapter.updateInvitation({
            invitationId: invitation.id,
            status: "accepted",
            fromStatus: "pending",
          });
          if (!accepted) {
            throw APIError.from("BAD_REQUEST", {
              message: "Invitation not found",
              code: "INVITATION_NOT_FOUND",
            });
          }

          await adapter.createMember({
            organizationId: invitation.organizationId,
            userId: createdUser.id,
            role: invitation.role,
            createdAt: new Date(),
          });

          const session = await ctx.context.internalAdapter.createSession(
            createdUser.id
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
              invitation.organizationId,
              ctx
            )) ?? session;
          await setSessionCookie(ctx, {
            session: activeSession,
            user: createdUser,
          });

          return ctx.json({ user: { id: createdUser.id, email } });
        }
      ),
    },
  };
}

import { APIError } from "better-auth/api";
import type { getOrgAdapter } from "better-auth/plugins";

type OrgAdapter = ReturnType<typeof getOrgAdapter>;

export type PendingInvitation = NonNullable<
  Awaited<ReturnType<OrgAdapter["findInvitationById"]>>
>;

export function throwInvitationNotFound(): never {
  throw APIError.from("BAD_REQUEST", {
    message: "Invitation not found",
    code: "INVITATION_NOT_FOUND",
  });
}

export async function requirePendingInvitation(
  adapter: OrgAdapter,
  invitationId: string
): Promise<PendingInvitation> {
  const invitation = await adapter.findInvitationById(invitationId);
  if (
    !invitation ||
    invitation.status !== "pending" ||
    invitation.expiresAt < new Date()
  ) {
    throwInvitationNotFound();
  }
  return invitation;
}

export function assertPasswordLength(
  password: string,
  config: { minPasswordLength: number; maxPasswordLength: number }
): void {
  if (password.length < config.minPasswordLength) {
    throw APIError.from("BAD_REQUEST", {
      message: "Password is too short",
      code: "PASSWORD_TOO_SHORT",
    });
  }
  if (password.length > config.maxPasswordLength) {
    throw APIError.from("BAD_REQUEST", {
      message: "Password is too long",
      code: "PASSWORD_TOO_LONG",
    });
  }
}

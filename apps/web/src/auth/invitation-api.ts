import { authClient } from "@/auth/client";

export interface InvitationPreview {
  id: string;
  email: string;
  role: string;
  organizationName: string;
}

function fetchErrorMessage(
  error: { message?: string; statusText?: string } | null | undefined,
  fallback: string
): string {
  return error?.message ?? error?.statusText ?? fallback;
}

export async function fetchInvitationPreview(
  invitationId: string
): Promise<InvitationPreview> {
  const { data, error } = await authClient.$fetch<InvitationPreview>(
    "/organization/invitation-preview",
    { method: "GET", query: { id: invitationId } }
  );
  if (error || !data) {
    throw new Error(fetchErrorMessage(error, "Invitation not found"));
  }
  return data;
}

export async function inviteSignUp(input: {
  invitationId: string;
  name: string;
  password: string;
}): Promise<void> {
  const { error } = await authClient.$fetch("/organization/invite-sign-up", {
    method: "POST",
    body: input,
  });
  if (error) {
    throw new Error(fetchErrorMessage(error, "Could not create account"));
  }
}

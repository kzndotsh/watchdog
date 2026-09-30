export function invitationAcceptPath(invitationId: string): string {
  return `/auth/accept-invitation/${invitationId}`;
}

export function buildInvitationAcceptUrl(
  baseUrl: string,
  invitationId: string
): string {
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}${invitationAcceptPath(invitationId)}`;
}

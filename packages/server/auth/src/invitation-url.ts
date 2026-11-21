export function invitationAcceptPath(invitationId: string): string {
  return `/auth/accept-invitation/${invitationId}`;
}

export function buildInvitationAcceptUrl(
  baseUrl: string,
  invitationId: string
): string {
  // Not a regex: `/\/+$/` backtracks quadratically on long runs of slashes.
  let end = baseUrl.length;
  while (end > 0 && baseUrl[end - 1] === "/") end -= 1;
  const base = baseUrl.slice(0, end);
  return `${base}${invitationAcceptPath(invitationId)}`;
}

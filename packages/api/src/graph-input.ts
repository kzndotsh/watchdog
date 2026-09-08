/** Strip agent-ingress custody field before core service calls. */
export function withoutUserOverride<T extends { userOverride?: unknown }>(
  input: T
): Omit<T, "userOverride"> {
  const { userOverride: _userOverride, ...rest } = input;
  return rest;
}

/** Empty-list follow-up hints for case-scoped noun commands. */
export function caseListHelp(
  _caseId: string,
  lines: readonly string[]
): string[] {
  return [...lines];
}

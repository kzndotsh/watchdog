/** Empty-list follow-up hints for case-scoped noun commands. */
export function caseListHelp(
  _caseId: string,
  lines: readonly string[]
): string[] {
  return [...lines];
}

/** Empty-list follow-up hints for entity-scoped noun commands. */
export function entityListHelp(
  _caseId: string,
  _entity: string,
  lines: readonly string[]
): string[] {
  return [...lines];
}

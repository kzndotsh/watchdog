/**
 * Screens a signed-in user with no live Case may still open: the account and organization
 * (Settings: invite people, keys), the Library (Caps and Playbooks need no Case), the
 * Deleted Cases view (the only way back to a Case in its restore window).
 * Everything else (dashboard, Cases, the Work screens, a Case URL) needs a Case and
 * sends the user to the first-Case step instead.
 */
const EXEMPT = /^\/(?:settings|library|deleted-cases)(?:\/|$)/;

/** Whether the first-Case gate applies to `pathname` (false for the exempt screens). */
export function firstCaseGateApplies(pathname: string): boolean {
  return !EXEMPT.test(pathname);
}

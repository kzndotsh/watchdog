import type { DeletedCaseRecord } from "@/domains/cases/types";

/** Who deleted it, for a line of copy: the display name, or a neutral phrase when unknown. */
export function deletedByLabel(
  deleted: Pick<DeletedCaseRecord, "deletedByName">
): string {
  return deleted.deletedByName ?? "an unknown user";
}

/** How long a deleted Case can still be restored, as the Deleted Cases list says it. */
export function restoreWindowLabel(
  deleted: Pick<DeletedCaseRecord, "daysLeft" | "purging">
): string {
  if (deleted.purging) return "Purge in progress";
  if (deleted.daysLeft <= 0) return "Restore window ended";
  return deleted.daysLeft === 1
    ? "1 day left to restore"
    : `${deleted.daysLeft} days left to restore`;
}

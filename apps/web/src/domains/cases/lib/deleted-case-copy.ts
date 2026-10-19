import type { DeletedCaseRecord } from "@/domains/cases/types";

/** "1 day" or "N days": the one place the unit is pluralised. */
export function daysLabel(days: number): string {
  return days === 1 ? "1 day" : `${days} days`;
}

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
  return `${daysLabel(deleted.daysLeft)} left to restore`;
}

/** Why Restore is disabled for a deleted Case, or null when it can be restored. */
export function restoreBlockedReason(
  deleted: Pick<DeletedCaseRecord, "daysLeft" | "purging">
): string | null {
  if (deleted.purging) {
    return "A purge has begun, so this Case can no longer be restored.";
  }
  if (deleted.daysLeft <= 0) {
    return "The restore window has ended; this Case is purged at the next run.";
  }
  return null;
}

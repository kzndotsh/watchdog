import { trimmedOrNull } from "@watchdog/schemas";

/** Normalize `actor_label` column before insert (api-key display snapshots). */
export function actorLabelForPersist(
  label: string | null | undefined
): string | null {
  return trimmedOrNull(label);
}

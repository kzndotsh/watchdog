import { egressClassLabel } from "./egress-class";
import { isUuidString } from "./primitives";
import { titleCase } from "./title-case";
import type { EgressClass } from "./vocab-egress";

/** Human label for a Cap's derived egress classes ("Local only", "Public lookups, Account lookups"). */
export function capEgressLabel(classes: readonly EgressClass[]): string {
  return classes.map((c) => egressClassLabel(c)).join(", ");
}

/** Human label for a capability id without catalog I/O. */
export function capabilityIdLabel(
  capabilityId: string | null | undefined
): string {
  if (!capabilityId) return "";
  const parts = capabilityId.split(".");
  const rest = parts.slice(1).join(" ");
  return rest === "" ? capabilityId : titleCase(rest);
}

/** Human label for a playbook id without catalog I/O. */
export function playbookIdLabel(playbookId: string | null | undefined): string {
  if (!playbookId) return "";
  if (isUuidString(playbookId)) return "Playbook";
  const parts = playbookId.split(".");
  const tail = parts.slice(1).join(" ");
  const base = tail === "" ? (parts[0] ?? playbookId) : tail;
  return titleCase(base.replaceAll("-", " "));
}

/**
 * The capability id of a large Case export Job. It is a system Job, not a catalog Cap
 * (`@watchdog/core` `jobs/system-jobs`): the web UI keys its download link on this id.
 */
export const CASE_EXPORT_JOB_ID = "system.case_export" as const;

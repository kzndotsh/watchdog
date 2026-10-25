import {
  blockedEgressClasses,
  egressClassLabel,
  egressDestinations,
  type CapContact,
} from "@watchdog/schemas/caps";
import type { EgressClass } from "@watchdog/schemas/shared";

/** Why a step cannot start on a Case: the classes it needs that the Case does not allow, and where the seed would go. */
export type EgressBlock = {
  classes: EgressClass[];
  destinations: string[];
};

/**
 * The egress block of a Cap or Playbook on a Case, or `undefined` when the Case allows every
 * class it needs. `needs` is the catalog's derived `egress` with its `contacts`.
 */
export function egressBlockOf(
  needs:
    | { egress: readonly EgressClass[]; contacts: readonly CapContact[] }
    | undefined,
  allowedEgress: readonly EgressClass[]
): EgressBlock | undefined {
  if (needs === undefined) return undefined;
  const classes = blockedEgressClasses(needs.egress, allowedEgress);
  if (classes.length === 0) return undefined;
  return { classes, destinations: egressDestinations(needs.contacts, classes) };
}

/** The blocked classes as a phrase: "Public lookups, Account lookups". */
export function egressClassesPhrase(classes: readonly EgressClass[]): string {
  return classes.map((c) => egressClassLabel(c)).join(", ");
}

/** The Run button's reason when a Case does not allow what the step needs. */
export function egressBlockedReason(
  block: EgressBlock,
  subject: "Cap" | "playbook"
): string {
  return `This Case does not allow ${egressClassesPhrase(block.classes)}, which this ${subject} needs`;
}

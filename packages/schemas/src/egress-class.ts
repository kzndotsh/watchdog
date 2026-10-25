import { z } from "zod";

import { EGRESS_CLASSES, type EgressClass } from "./vocab-egress";

export const egressClassSchema = z.enum(EGRESS_CLASSES);

/** What a new Case allows (`cases.allowed_egress`): nothing leaves except to the target itself. */
export const DEFAULT_ALLOWED_EGRESS: readonly EgressClass[] = [
  "local",
  "target",
];

/**
 * A Case's allowed classes as the API and the forms carry them. `local` is always in the set:
 * a Case cannot forbid work that stays on the install.
 */
export const allowedEgressSchema = z
  .array(egressClassSchema)
  .max(EGRESS_CLASSES.length)
  .refine((classes) => classes.includes("local"), {
    message: "A Case always allows local",
  });

/** The classes in canonical order, without duplicates, with `local` always present. */
export function normalizeAllowedEgress(
  classes: readonly EgressClass[]
): EgressClass[] {
  const set = new Set<EgressClass>([...classes, "local"]);
  return EGRESS_CLASSES.filter((c) => set.has(c));
}

/** Whether a Case allows the class (`local` always). */
export function allowsEgressClass(
  allowed: readonly EgressClass[],
  egressClass: EgressClass
): boolean {
  return egressClass === "local" || allowed.includes(egressClass);
}

/** The classes of `needed` the Case does not allow, in canonical order. Empty means the step may run. */
export function blockedEgressClasses(
  needed: readonly EgressClass[],
  allowed: readonly EgressClass[]
): EgressClass[] {
  return EGRESS_CLASSES.filter(
    (c) => needed.includes(c) && !allowsEgressClass(allowed, c)
  );
}

const EGRESS_CLASS_LABELS: Record<EgressClass, string> = {
  local: "Local only",
  target: "The target itself",
  public_lookup: "Public lookups",
  account_lookup: "Account lookups",
  model: "AI model",
};

const EGRESS_CLASS_DESCRIPTIONS: Record<EgressClass, string> = {
  local: "Nothing leaves this install.",
  target:
    "Requests go to the host, URL or address you investigate, so the subject can see them.",
  public_lookup:
    "The seed goes to anonymous public sources such as certificate logs, WHOIS and web archives.",
  account_lookup:
    "The seed goes to vendor APIs under your own keys, such as Shodan or VirusTotal.",
  model: "Case text goes to the configured AI model endpoint.",
};

export function egressClassLabel(egressClass: EgressClass): string {
  return EGRESS_CLASS_LABELS[egressClass];
}

export function egressClassDescription(egressClass: EgressClass): string {
  return EGRESS_CLASS_DESCRIPTIONS[egressClass];
}

/**
 * The reason a step is blocked, naming the classes the Case does not allow and where the seed
 * would go. One sentence pair shared by the API, the worker and the UI.
 */
export function formatEgressBlock(input: {
  capabilityId: string;
  classes: readonly EgressClass[];
  destinations: readonly string[];
}): string {
  const labels = input.classes.map((c) => egressClassLabel(c)).join(", ");
  const where =
    input.destinations.length === 0
      ? ""
      : ` It would send the seed to ${input.destinations.join(", ")}.`;
  return `This Case does not allow ${labels} egress, which ${input.capabilityId} needs.${where} An owner or admin can allow it in Case settings.`;
}

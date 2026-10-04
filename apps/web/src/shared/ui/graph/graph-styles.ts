import type { ConfidenceTier, EntityKind } from "@watchdog/schemas/shared";

/** Stroke color for canvas edges — greenfield tiers only (no probable). */
export function confidenceStroke(confidence: ConfidenceTier): string {
  if (confidence === "confirmed") {
    return "var(--confidence-confirmed)";
  }
  if (confidence === "possible") {
    return "var(--confidence-possible)";
  }
  return "var(--confidence-unverified)";
}

/** Node border from entity kind CSS tokens (person | infra | org). */
export function kindBorder(kind: EntityKind): string {
  if (kind === "person") {
    return "var(--kind-person)";
  }
  if (kind === "infra") {
    return "var(--kind-infra)";
  }
  if (kind === "org") {
    return "var(--kind-org)";
  }
  return "var(--border)";
}

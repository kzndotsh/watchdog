import { optionsFromLabels, titleCase } from "@/shared/ui/vocab/title-case";
import type { VocabTone } from "@/shared/ui/vocab/vocab-badge";
import {
  CONFIDENCE_TIERS,
  CONFIDENCE_TIER_LABELS,
  type ConfidenceTier,
} from "@watchdog/schemas";

export const CONFIDENCE_LABELS = CONFIDENCE_TIER_LABELS;

export const CONFIDENCE_TONES: Record<ConfidenceTier, VocabTone> = {
  confirmed: {
    low: "bg-confidence-confirmed-bg text-confidence-confirmed-fg",
    high: "bg-confidence-confirmed text-primary-foreground",
  },
  possible: {
    low: "bg-confidence-possible-bg text-confidence-possible-fg",
    high: "bg-confidence-possible text-signal-foreground",
  },
  unverified: {
    low: "bg-confidence-unverified-bg text-confidence-unverified-fg",
    high: "bg-confidence-unverified text-primary-foreground",
  },
};

export const CONFIDENCE_OPTIONS = optionsFromLabels(
  CONFIDENCE_TIERS,
  CONFIDENCE_LABELS
);

export function confidenceLabel(value: ConfidenceTier): string {
  return CONFIDENCE_LABELS[value] ?? titleCase(value);
}

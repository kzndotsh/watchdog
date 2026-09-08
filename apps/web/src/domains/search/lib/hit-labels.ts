import { evidencePrimaryLabel } from "@/shared/ui/intake/evidence-option";
import {
  capabilityLabel,
  jobHeadlineLabel,
  proposalHeadlineLabel,
} from "@/shared/ui/vocab";
import { summarizeJobInput } from "@watchdog/schemas";
import type { EvidenceKind, JsonObject } from "@watchdog/schemas";

export function searchEvidenceHitLabel(hit: {
  label: string | null;
  kind: EvidenceKind;
  sourceUrl?: string | null;
}): string {
  return evidencePrimaryLabel(hit);
}

export function searchJobHitLabel(
  hit: {
    capabilityId: string;
    resultSummary: string | null;
    input: JsonObject;
    playbookId?: string | null;
  },
  evidenceLabels?: Readonly<Record<string, string>>,
  entityLabels?: Readonly<Record<string, string>>
): string {
  const evidenceTitleById =
    evidenceLabels === undefined
      ? undefined
      : new Map(Object.entries(evidenceLabels));
  const entityTitleById =
    entityLabels === undefined
      ? undefined
      : new Map(Object.entries(entityLabels));
  const headline =
    jobHeadlineLabel(hit) ||
    capabilityLabel(hit.capabilityId) ||
    hit.capabilityId;
  const summary = hit.resultSummary?.trim();
  if (summary) return `${headline} — ${summary}`;
  const subject = summarizeJobInput(
    hit.input,
    evidenceTitleById,
    entityTitleById
  );
  if (subject !== "") return `${headline} — ${subject}`;
  return headline;
}

export function searchProposalHitLabel(hit: {
  summary: string | null;
  capabilityId: string | null;
  playbookId?: string | null;
  entityName?: string | null;
}): string {
  return proposalHeadlineLabel(hit) || "Proposal";
}

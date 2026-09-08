import { capabilityLabel } from "@/shared/ui/vocab/capability";
import { playbookLabel } from "@/shared/ui/vocab/playbook";

/** Playbook or capability label for a proposal (no summary / entity). */
export function proposalSourceLabel(opts: {
  capabilityId: string | null;
  playbookId?: string | null;
}): string {
  if (opts.playbookId) return playbookLabel(opts.playbookId);
  if (opts.capabilityId) return capabilityLabel(opts.capabilityId);
  return "";
}

/** Primary proposal headline: summary, then playbook/capability + entity. */
export function proposalHeadlineLabel(opts: {
  summary: string | null;
  capabilityId: string | null;
  playbookId?: string | null;
  entityName?: string | null;
}): string {
  const summary = opts.summary?.trim();
  if (summary) return summary;

  const cap = proposalSourceLabel(opts);
  const entityName = opts.entityName?.trim();
  if (cap && entityName) return `${cap} · ${entityName}`;
  if (cap) return cap;
  if (entityName) return entityName;
  return "";
}

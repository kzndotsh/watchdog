import { capabilityLabel } from "@/shared/ui/vocab/capability";
import { playbookLabel } from "@/shared/ui/vocab/playbook";

/** Primary job headline: playbook name when present, otherwise capability. */
export function jobHeadlineLabel(job: {
  capabilityId: string;
  playbookId?: string | null;
  playbookTitle?: string | null;
}): string {
  if (job.playbookId) {
    return playbookLabel(job.playbookId, job.playbookTitle);
  }
  return capabilityLabel(job.capabilityId);
}

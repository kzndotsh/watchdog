import { capabilityIdLabel, playbookIdLabel } from "@watchdog/schemas/caps";
import { summarizeJobInput } from "@watchdog/schemas/jobs";
import type { JsonObject } from "@watchdog/schemas/shared";

export function jobActivityLabel(opts: {
  capabilityId: string;
  resultSummary: string | null;
  input: JsonObject;
  playbookId?: string | null;
  evidenceTitleById?: ReadonlyMap<string, string>;
  entityTitleById?: ReadonlyMap<string, string>;
}): string {
  const headline = opts.playbookId
    ? playbookIdLabel(opts.playbookId)
    : capabilityIdLabel(opts.capabilityId) || opts.capabilityId;
  const summary = opts.resultSummary?.trim();
  if (summary) return `${headline} — ${summary}`;
  const subject = summarizeJobInput(
    opts.input,
    opts.evidenceTitleById,
    opts.entityTitleById
  );
  if (subject !== "") return `${headline} — ${subject}`;
  return headline;
}

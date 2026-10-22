import type {
  LibraryReadiness,
  LibraryReadinessState,
} from "@/domains/library/types";

export type PlaybookReadinessRollup = {
  total: number;
  counts: Record<LibraryReadinessState, number>;
};

/** How many of a Playbook's steps are ready, need a key, are off or unavailable. */
export function rollUpReadiness(
  steps: readonly { readiness: LibraryReadiness }[]
): PlaybookReadinessRollup {
  const counts: Record<LibraryReadinessState, number> = {
    ready: 0,
    needs_key: 0,
    off_by_operator: 0,
    unavailable: 0,
  };
  for (const step of steps) counts[step.readiness.state] += 1;
  return { total: steps.length, counts };
}

/** "2 of 5 steps are missing API keys; 1 of 5 steps is off by the operator.": the parts that are not zero. */
export function rollupSummary(rollup: PlaybookReadinessRollup): string {
  const { total, counts } = rollup;
  if (total === 0) return "This Playbook has no steps.";
  const noun = total === 1 ? "step" : "steps";
  const parts: string[] = [];
  if (counts.needs_key > 0) {
    parts.push(
      `${counts.needs_key} of ${total} ${noun} ${counts.needs_key === 1 ? "is missing an API key" : "are missing API keys"}`
    );
  }
  if (counts.off_by_operator > 0) {
    parts.push(
      `${counts.off_by_operator} of ${total} ${noun} ${counts.off_by_operator === 1 ? "is" : "are"} off by the operator`
    );
  }
  if (counts.unavailable > 0) {
    parts.push(
      `${counts.unavailable} of ${total} ${noun} ${counts.unavailable === 1 ? "is" : "are"} unavailable`
    );
  }
  return parts.length === 0
    ? `All ${total} ${noun} ${total === 1 ? "is" : "are"} ready.`
    : `${parts.join("; ")}.`;
}

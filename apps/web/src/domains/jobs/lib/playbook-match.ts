import { playbookSeedRequirements } from "@/domains/jobs/lib/playbook-seed-requirements";
import type { PlaybookListItem } from "@/domains/jobs/types";
import { egressClassLabel } from "@watchdog/schemas/caps";
import type { EgressClass, PlaybookSeedKind } from "@watchdog/schemas/shared";

/** The egress classes' labels, for the `egress` filter ("Public lookups"). */
export const PLAYBOOK_EGRESS_LABELS: Record<EgressClass, string> = {
  local: egressClassLabel("local"),
  target: egressClassLabel("target"),
  public_lookup: egressClassLabel("public_lookup"),
  account_lookup: egressClassLabel("account_lookup"),
  model: egressClassLabel("model"),
};

/**
 * What narrows the Playbooks (`playbookPickList`'s query: each list is "any of", empty is no
 * filter).
 */
export type PlaybookMatchFilters = {
  seeds: readonly string[];
  egress: readonly string[];
  isKeyOnlyNeeded: boolean;
  isUrlDumpOnly: boolean;
};

export function playbookPrimarySeed(
  playbook: PlaybookListItem
): PlaybookSeedKind | undefined {
  return playbook.seedKinds[0];
}

export function playbookRequiresKey(playbook: PlaybookListItem): boolean {
  for (const spec of playbook.requires.credentials) {
    if ("anyOf" in spec) return true;
    if (spec.optional !== true) return true;
  }
  return false;
}

export function playbookPickUrlDump(playbook: PlaybookListItem): boolean {
  return playbookSeedRequirements(playbook).shouldPickUrlDump;
}

function playbookMatchesFilters(
  playbook: PlaybookListItem,
  filters: PlaybookMatchFilters
): boolean {
  if (
    filters.seeds.length > 0 &&
    !playbook.seedKinds.some((kind) => filters.seeds.includes(kind))
  ) {
    return false;
  }
  if (
    filters.egress.length > 0 &&
    !playbook.requires.egress.some((c) => filters.egress.includes(c))
  ) {
    return false;
  }
  if (filters.isKeyOnlyNeeded && !playbookRequiresKey(playbook)) return false;
  if (filters.isUrlDumpOnly && !playbookPickUrlDump(playbook)) return false;
  return true;
}

/** Filter playbooks for the Jobs / Collect playbook launcher. */
export function matchPlaybooks(
  playbooks: readonly PlaybookListItem[],
  filters: PlaybookMatchFilters
): PlaybookListItem[] {
  return playbooks.filter((playbook) =>
    playbookMatchesFilters(playbook, filters)
  );
}

import type { PlaybookListItem } from "@/domains/jobs/types";
import {
  PLAYBOOK_SEED_KIND_LABELS,
  isPlaybookSeedKind,
} from "@watchdog/schemas";

function playbookSeedGroupLabelForKey(seed: string): string {
  return isPlaybookSeedKind(seed) ? PLAYBOOK_SEED_KIND_LABELS[seed] : seed;
}

export function playbookSeedGroup(playbook: PlaybookListItem): string {
  const seed = playbook.seedKinds[0];
  if (seed !== undefined) return seed;
  return playbook.id.split("-")[0] ?? "other";
}

export function playbookSeedGroupLabel(playbook: PlaybookListItem): string {
  return playbookSeedGroupLabelForKey(playbookSeedGroup(playbook));
}

export function groupPlaybooksBySeed(
  playbooks: readonly PlaybookListItem[]
): { label: string; playbooks: PlaybookListItem[] }[] {
  const map = new Map<string, PlaybookListItem[]>();
  for (const playbook of playbooks) {
    const key = playbookSeedGroup(playbook);
    const list = map.get(key) ?? [];
    list.push(playbook);
    map.set(key, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([seed, list]) => ({
      label: playbookSeedGroupLabelForKey(seed),
      playbooks: [...list].sort((a, b) => a.title.localeCompare(b.title)),
    }));
}

export function playbookMatchesQuery(
  playbook: PlaybookListItem,
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  if (playbook.title.toLowerCase().includes(q)) return true;
  if (playbook.id.toLowerCase().includes(q)) return true;
  if (playbook.description.toLowerCase().includes(q)) return true;
  if (playbook.steps.some((step) => step.toLowerCase().includes(q))) {
    return true;
  }
  return false;
}

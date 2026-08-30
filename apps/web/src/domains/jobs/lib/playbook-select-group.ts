import type { PlaybookListItem } from "@/domains/jobs/types";

const SEED_GROUP_LABELS: Record<string, string> = {
  host: "Host",
  url: "URL",
  evidence: "Evidence",
  ip: "IP",
  email: "Email",
  hash: "Hash",
  handle: "Handle",
};

export function playbookSeedGroup(playbook: PlaybookListItem): string {
  const seed = playbook.seedKinds[0];
  if (seed !== undefined) return seed;
  return playbook.id.split("-")[0] ?? "other";
}

export function playbookSeedGroupLabel(playbook: PlaybookListItem): string {
  const seed = playbookSeedGroup(playbook);
  return SEED_GROUP_LABELS[seed] ?? seed;
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
      label: SEED_GROUP_LABELS[seed] ?? seed,
      playbooks: list.sort((a, b) => a.title.localeCompare(b.title)),
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

import { playbookIdLabel } from "@watchdog/schemas";

/** Human label for a playbook id when catalog title is unavailable. */
export function playbookLabel(
  playbookId: string | null | undefined,
  title?: string | null
): string {
  if (title !== undefined && title !== null && title.trim() !== "") {
    return title.trim();
  }
  if (!playbookId) return "Playbook";
  const label = playbookIdLabel(playbookId);
  return label === "" ? "Playbook" : label;
}

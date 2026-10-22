/** The Library's category id for every Playbook; Caps take theirs from their id. */
export const PLAYBOOK_CATEGORY = "playbook";

/** A Cap's category is the first segment of its id (`network.dns.lookup` is network). */
export function capCategory(capId: string): string {
  return capId.split(".")[0] ?? capId;
}

/**
 * A category as Collect and the Library name it: the id capitalized ("Network", "Threat"), and
 * "Playbooks" for Playbooks.
 */
export function categoryLabel(category: string): string {
  if (category === PLAYBOOK_CATEGORY) return "Playbooks";
  return `${category.charAt(0).toUpperCase()}${category.slice(1)}`;
}

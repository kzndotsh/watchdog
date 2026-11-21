/** Lowercase haystack for dotted/slug catalog ids (capability, playbook). */
export function catalogIdSearchHaystack(id: string | null | undefined): string {
  const trimmed = id?.trim() ?? "";
  if (trimmed === "") return "";
  const humanized = trimmed.replaceAll(/[._-]+/g, " ");
  return `${trimmed} ${humanized}`.toLowerCase();
}

/** Case-insensitive substring match against raw + humanized catalog ids. */
export function catalogIdMatchesSearch(
  id: string | null | undefined,
  term: string
): boolean {
  const q = term.trim().toLowerCase();
  if (q === "") return true;
  return catalogIdSearchHaystack(id).includes(q);
}

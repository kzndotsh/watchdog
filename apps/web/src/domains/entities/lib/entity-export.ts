import { toast } from "sonner";

/** Fetch entity Markdown export for clipboard / AI handoff. */
export async function fetchEntityMarkdown(
  caseId: string,
  entitySlug: string
): Promise<string> {
  const url = `/api/v1/cases/${caseId}/entities/${entitySlug}/export.md`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Export failed (${res.status})`);
  }
  return res.text();
}

export function entityDossierPath(entitySlug: string): string {
  return `/entities/${entitySlug}`;
}

export function entityDossierUrl(entitySlug: string): string {
  if (typeof window === "undefined") return entityDossierPath(entitySlug);
  return `${window.location.origin}${entityDossierPath(entitySlug)}`;
}

export async function copyEntityLink(entitySlug: string): Promise<void> {
  await navigator.clipboard.writeText(entityDossierUrl(entitySlug));
  toast.success("Link copied");
}

export async function copyEntityMarkdown(
  caseId: string,
  entitySlug: string
): Promise<void> {
  const md = await fetchEntityMarkdown(caseId, entitySlug);
  await navigator.clipboard.writeText(md);
  toast.success("Copied to clipboard");
}

export async function copyIdentifierValue(value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
  toast.success("Copied");
}

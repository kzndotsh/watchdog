import { toast } from "sonner";

const EXTERNAL_AI_URL_MAX = 1800;

export function entityMarkdownExportPath(
  caseId: string,
  entitySlug: string
): string {
  return `/api/v1/cases/${caseId}/entities/${encodeURIComponent(entitySlug)}/export.md`;
}

/** Fetch entity Markdown export for clipboard / AI handoff. */
export async function fetchEntityMarkdown(
  caseId: string,
  entitySlug: string
): Promise<string> {
  const url = entityMarkdownExportPath(caseId, entitySlug);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Export failed (${res.status})`);
  }
  return res.text();
}

export function entityDossierPath(entitySlug: string): string {
  return `/entities/${encodeURIComponent(entitySlug)}`;
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

/** Open entity Markdown in an external AI chat URL (length-limited). */
export async function openEntityMarkdownInChat(
  baseUrl: string,
  caseId: string,
  entitySlug: string,
  successMessage: string
): Promise<void> {
  const md = await fetchEntityMarkdown(caseId, entitySlug);
  const url = `${baseUrl}${encodeURIComponent(md)}`;
  if (url.length > EXTERNAL_AI_URL_MAX) {
    throw new Error(
      "Export is too large for a browser link — copy Markdown instead"
    );
  }
  window.open(url, "_blank");
  toast.success(successMessage);
}

export async function copyIdentifierValue(value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
  toast.success("Copied");
}

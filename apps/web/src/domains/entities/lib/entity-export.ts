import { couldnt } from "@/lib/utils";
import { entityMarkdownExportPath } from "@/shared/lib/api-urls";
import { TOAST_COPIED } from "@/shared/lib/toast-copy";
import { toast } from "@/shared/ui/toast";

const EXTERNAL_AI_URL_MAX = 1800;

/** Fetch entity Markdown export for clipboard / AI handoff. */
export async function fetchEntityMarkdown(
  caseId: string,
  entitySlug: string
): Promise<string> {
  const url = entityMarkdownExportPath(caseId, entitySlug);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${couldnt("export", "entities")} (${res.status})`);
  }
  return res.text();
}

/** The Dossier's shareable path: the Case slug is in it, so it opens the right Case. */
export function entityDossierPath(
  caseSlug: string,
  entitySlug: string
): string {
  return `/cases/${encodeURIComponent(caseSlug)}/entities/${encodeURIComponent(entitySlug)}`;
}

export function entityDossierUrl(caseSlug: string, entitySlug: string): string {
  const path = entityDossierPath(caseSlug, entitySlug);
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

export async function copyEntityLink(
  caseSlug: string,
  entitySlug: string
): Promise<void> {
  await navigator.clipboard.writeText(entityDossierUrl(caseSlug, entitySlug));
  toast.success(TOAST_COPIED);
}

export async function copyEntityMarkdown(
  caseId: string,
  entitySlug: string
): Promise<void> {
  const md = await fetchEntityMarkdown(caseId, entitySlug);
  await navigator.clipboard.writeText(md);
  toast.success(TOAST_COPIED);
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
  toast.success(TOAST_COPIED);
}

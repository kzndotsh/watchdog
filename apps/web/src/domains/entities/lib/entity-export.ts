import { recordAiHandoffFn } from "@/domains/entities/entities.functions";
import { couldnt } from "@/lib/utils";
import { entityMarkdownExportPath } from "@/shared/lib/api-urls";
import { TOAST_COPIED } from "@/shared/lib/toast-copy";
import { toast } from "@/shared/ui/toast";
import type { AiHandoffDestination } from "@watchdog/schemas/shared";

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

export function entityDossierPath(entitySlug: string): string {
  return `/entities/${encodeURIComponent(entitySlug)}`;
}

export function entityDossierUrl(entitySlug: string): string {
  if (typeof window === "undefined") return entityDossierPath(entitySlug);
  return `${window.location.origin}${entityDossierPath(entitySlug)}`;
}

export async function copyEntityLink(entitySlug: string): Promise<void> {
  await navigator.clipboard.writeText(entityDossierUrl(entitySlug));
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

/** Where "Open in ..." sends a Dossier: the chat's new-conversation URL, which takes the text as `q`. */
const AI_HANDOFF_TARGETS = {
  claude: { baseUrl: "https://claude.ai/new?q=", opened: "Opened in Claude" },
  chatgpt: { baseUrl: "https://chatgpt.com/?q=", opened: "Opened in ChatGPT" },
} as const satisfies Record<
  AiHandoffDestination,
  { baseUrl: string; opened: string }
>;

/** An Entity's Markdown, read and sized, waiting for the user to confirm it may leave Watchdog. */
export type PendingAiHandoff = {
  destination: AiHandoffDestination;
  caseId: string;
  entitySlug: string;
  entityName: string;
  /** The chat URL carrying the text; opened only after the confirmation. */
  url: string;
  characters: number;
  bytes: number;
};

/**
 * Read the Entity's Markdown and build the chat link, without opening it. The
 * text is not kept: the confirmation shows its size and the link carries it.
 */
export async function prepareAiHandoff(input: {
  destination: AiHandoffDestination;
  caseId: string;
  entitySlug: string;
  entityName: string;
}): Promise<PendingAiHandoff> {
  const md = await fetchEntityMarkdown(input.caseId, input.entitySlug);
  const url = `${AI_HANDOFF_TARGETS[input.destination].baseUrl}${encodeURIComponent(md)}`;
  if (url.length > EXTERNAL_AI_URL_MAX) {
    throw new Error(
      "Export is too large for a browser link — copy Markdown instead"
    );
  }
  return {
    ...input,
    url,
    characters: md.length,
    bytes: new TextEncoder().encode(md).length,
  };
}

/** "1,234 characters (1.2 KB)" for the confirmation. */
export function formatHandoffSize(handoff: {
  characters: number;
  bytes: number;
}): string {
  const characters = handoff.characters.toLocaleString("en-US");
  const kb = (handoff.bytes / 1024).toFixed(1);
  return `${characters} characters (${kb} KB)`;
}

/**
 * The confirmed handoff: the server records it first (and refuses when the
 * organization has turned handoff off), then the chat opens. A handoff that
 * could not be recorded does not open.
 */
export async function confirmAiHandoff(
  handoff: PendingAiHandoff
): Promise<void> {
  await recordAiHandoffFn({
    data: {
      caseId: handoff.caseId,
      slug: handoff.entitySlug,
      destination: handoff.destination,
    },
  });
  const opened = window.open(handoff.url, "_blank");
  if (opened === null) {
    // The handoff is recorded, but the browser blocked the tab: say so, never "Opened".
    throw new Error(
      "Your browser blocked the new tab. Allow pop-ups for Watchdog and send again."
    );
  }
  toast.success(AI_HANDOFF_TARGETS[handoff.destination].opened);
}

export async function copyIdentifierValue(value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
  toast.success(TOAST_COPIED);
}

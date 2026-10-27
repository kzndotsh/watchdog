import { recordOpenInFn } from "@/domains/entities/entities.functions";
import { couldnt } from "@/lib/utils";
import { entityMarkdownExportPath } from "@/shared/lib/api-urls";
import { dossierPath } from "@/shared/lib/case-path";
import { TOAST_COPIED } from "@/shared/lib/toast-copy";
import { toast } from "@/shared/ui/toast";
import type { OpenInDestination } from "@watchdog/schemas/shared";

const EXTERNAL_AI_URL_MAX = 1800;

/** Fetch entity Markdown export for clipboard / Open in. */
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

/** The Dossier's shareable URL: the Case slug is in its path, so it opens the right Case. */
export function entityDossierUrl(caseSlug: string, entitySlug: string): string {
  const path = dossierPath(caseSlug, entitySlug);
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

/** Where "Open in ..." sends a Dossier: the chat's new-conversation URL, which takes the text as `q`. */
const OPEN_IN_TARGETS = {
  claude: { baseUrl: "https://claude.ai/new?q=", opened: "Opened in Claude" },
  chatgpt: { baseUrl: "https://chatgpt.com/?q=", opened: "Opened in ChatGPT" },
} as const satisfies Record<
  OpenInDestination,
  { baseUrl: string; opened: string }
>;

/** An Entity's Markdown, read and sized, waiting for the user to confirm it may leave Watchdog. */
export type PendingOpenIn = {
  destination: OpenInDestination;
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
export async function prepareOpenIn(input: {
  destination: OpenInDestination;
  caseId: string;
  entitySlug: string;
  entityName: string;
}): Promise<PendingOpenIn> {
  const md = await fetchEntityMarkdown(input.caseId, input.entitySlug);
  const url = `${OPEN_IN_TARGETS[input.destination].baseUrl}${encodeURIComponent(md)}`;
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
export function formatOpenInSize(openIn: {
  characters: number;
  bytes: number;
}): string {
  const characters = openIn.characters.toLocaleString("en-US");
  const kb = (openIn.bytes / 1024).toFixed(1);
  return `${characters} characters (${kb} KB)`;
}

export const OPEN_IN_TAB_BLOCKED =
  "Your browser blocked the new tab. Allow pop-ups for Watchdog and send again.";

/**
 * The blank tab the chat will load in, opened inside the confirming click: browsers
 * block a tab opened after an await. `null` when the browser blocked it anyway.
 */
export function openOpenInTab(): Window | null {
  const tab = window.open("about:blank", "_blank");
  // The chat page must not reach back into Watchdog through `window.opener`.
  if (tab !== null) tab.opener = null;
  return tab;
}

/**
 * The confirmed Open in: the server records it first (and refuses when the
 * organization has turned Open in off), then the blank tab loads the chat. An
 * Open in that could not be recorded closes the tab without loading anything.
 */
export async function confirmOpenIn({
  openIn,
  tab,
}: {
  openIn: PendingOpenIn;
  tab: Window;
}): Promise<void> {
  try {
    await recordOpenInFn({
      data: {
        caseId: openIn.caseId,
        slug: openIn.entitySlug,
        destination: openIn.destination,
      },
    });
  } catch (error) {
    tab.close();
    throw error;
  }
  tab.location.replace(openIn.url);
  toast.success(OPEN_IN_TARGETS[openIn.destination].opened);
}

export async function copyIdentifierValue(value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
  toast.success(TOAST_COPIED);
}

import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

import { slugifyName as schemaSlugifyName } from "@watchdog/schemas";

/**
 * Type-role utilities (`text-label-mono-sm`, `text-chip`, …) must live in the
 * font-size group — otherwise twMerge treats them as text-color and strips them
 * when paired with `text-muted-foreground` (QueueRowMeta looked body-sized).
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "heading-page",
            "heading-dossier",
            "heading-section",
            "label",
            "label-sm",
            "label-meta",
            "label-meta-sm",
            "label-mono",
            "label-mono-sm",
            "copy",
            "copy-sm",
            "meta",
            "chip",
            "2xs",
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugifyName(name: string): string {
  return schemaSlugifyName(name);
}

/** Keep slug in lockstep with name until the user edits it. */
export function nextAutoSlug(
  previousName: string,
  previousSlug: string,
  nextName: string
): string | null {
  const stillAuto = !previousSlug || previousSlug === slugifyName(previousName);
  return stillAuto ? slugifyName(nextName) : null;
}

export function errMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

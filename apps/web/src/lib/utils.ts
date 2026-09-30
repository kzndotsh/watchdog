import { createCn } from "cn/config";

import { slugifyName as schemaSlugifyName } from "@watchdog/schemas";

/**
 * Type-role utilities (`text-label-mono-sm`, `text-chip`, …) must live in the
 * font-size group — otherwise cn treats them as text-color and strips them
 * when paired with `text-muted-foreground` (QueueRowMeta looked body-sized).
 * Used by atoms and primitive wrappers; vendored primitives use stock `cn`, so keep
 * type roles out of `className` passed into them (see ui/vendor.md).
 */
export const cn = createCn({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "heading-page",
            "heading-dossier",
            "heading-section",
            "label",
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

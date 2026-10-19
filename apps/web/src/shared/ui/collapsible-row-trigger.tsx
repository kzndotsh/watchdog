import type { ComponentProps } from "react";

import { CollapsibleTrigger } from "@watchdog/ui/components/collapsible";

/**
 * A full-width, non-button Collapsible trigger row: top-aligned content, hover wash,
 * focus ring. Children that react to the open state use
 * `group-aria-expanded/row-trigger:`. The atom owns its spacing, so domains don't
 * restyle `CollapsibleTrigger` (`shadcn/no-restyle`).
 */
export function CollapsibleRowTrigger(
  props: Omit<
    ComponentProps<typeof CollapsibleTrigger>,
    "className" | "nativeButton" | "render"
  >
) {
  return (
    <CollapsibleTrigger
      nativeButton={false}
      render={<div />}
      className="group/row-trigger hover:bg-muted/40 focus-visible:ring-ring/50 flex w-full items-start gap-2 px-3 py-2.5 text-left outline-none focus-visible:ring-2"
      {...props}
    />
  );
}

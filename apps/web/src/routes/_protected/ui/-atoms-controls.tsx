import type { ReactNode } from "react";

import { Eyebrow } from "@/shared/ui/eyebrow";
import { Button, type ButtonSize } from "@/shared/ui/primitives/button";

export interface AtomEntry {
  name: string;
  blurb: string;
  render: () => ReactNode;
}

/** Every Button size, in scale order: the one place all of them sit side by side. */
const BUTTON_SIZES: readonly ButtonSize[] = [
  "xs",
  "sm",
  "default",
  "lg",
  "icon-xs",
  "icon-sm",
  "icon",
  "icon-lg",
];

/** Specimens for the Button size scale and the Eyebrow label (listed first on `/ui` Atoms). */
export const CONTROL_ATOMS: AtomEntry[] = [
  {
    name: "Button",
    blurb:
      "Height comes from size (xs h-5, sm h-6, default h-7, lg h-8, icon*, inline); never from className.",
    render: () => (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {BUTTON_SIZES.map((size) => (
            <Button
              key={size}
              type="button"
              size={size}
              variant="outline"
              aria-label={size.startsWith("icon") ? size : undefined}
            >
              {size.startsWith("icon") ? "+" : size}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="default">
            default
          </Button>
          <Button type="button" variant="secondary">
            secondary
          </Button>
          <Button type="button" variant="ghost">
            ghost
          </Button>
          <Button type="button" variant="destructive">
            destructive
          </Button>
          <Button type="button" variant="link">
            link
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          Running text with an{" "}
          <Button type="button" size="inline" variant="link">
            inline link
          </Button>{" "}
          that keeps its line height.
        </p>
      </div>
    ),
  },
  {
    name: "Eyebrow",
    blurb: "Uppercase tracked label — a kind, an action or a hint.",
    render: () => (
      <div className="flex flex-wrap items-center gap-3">
        <Eyebrow>Muted</Eyebrow>
        <Eyebrow tone="foreground">Foreground</Eyebrow>
        <Eyebrow tone="inherit" className="text-status-running-fg">
          Inherit
        </Eyebrow>
      </div>
    ),
  },
];

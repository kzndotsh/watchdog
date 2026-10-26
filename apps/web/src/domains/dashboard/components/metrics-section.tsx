import { Link } from "@tanstack/react-router";

import type { WorkHref } from "@/config/nav";
import { cn } from "@/lib/utils";

export type MetricTile = {
  id: string;
  label: string;
  value: number | string;
  hint?: string;
  to: WorkHref;
  tone?: "default" | "warn" | "muted";
};

type MetricsSectionProps = {
  tiles: MetricTile[];
  className?: string;
  /** Accessible name for the stats grid. */
  label?: string;
};

export function MetricsSection({
  tiles,
  className,
  label = "Overview",
}: MetricsSectionProps) {
  return (
    <section
      aria-label={label}
      className={cn("grid shrink-0 grid-cols-3 gap-2", className)}
    >
      {tiles.map((tile) => {
        const tileClass = cn(
          "relative flex flex-col gap-1 rounded-md px-3 py-2.5 transition-colors",
          "hover:bg-muted/40 focus-visible:bg-muted/50 focus-visible:outline-none",
          tile.tone === "warn" && "text-warning",
          tile.tone === "muted" && "opacity-80"
        );
        const face = (
          <>
            {tile.hint ? (
              <span className="text-2xs text-muted-foreground absolute top-2.5 right-3 font-mono">
                {tile.hint}
              </span>
            ) : null}
            <span
              className={cn(
                "text-2xl leading-tight font-semibold tracking-tight tabular-nums",
                tile.tone === "warn" && "text-warning",
                tile.hint && "pr-16"
              )}
            >
              {tile.value}
            </span>
            <span className="text-muted-foreground text-sm leading-tight">
              {tile.label}
            </span>
          </>
        );
        return tile.to.to === "/cases" ? (
          <Link key={tile.id} to="/cases" className={tileClass}>
            {face}
          </Link>
        ) : (
          <Link
            key={tile.id}
            to={tile.to.to}
            params={tile.to.params}
            search={tile.to.search}
            className={tileClass}
          >
            {face}
          </Link>
        );
      })}
    </section>
  );
}

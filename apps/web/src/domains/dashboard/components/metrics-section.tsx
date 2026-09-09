import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";

export interface MetricTile {
  id: string;
  label: string;
  value: number | string;
  hint?: string;
  to:
    | "/cases"
    | "/entities"
    | "/identifiers"
    | "/graph"
    | "/triage"
    | "/collect"
    | "/tasks";
  tone?: "default" | "warn" | "muted";
}

export function MetricsSection({
  tiles,
  className,
  label = "Overview",
}: {
  tiles: MetricTile[];
  className?: string;
  /** Accessible name for the stats grid. */
  label?: string;
}) {
  return (
    <section
      aria-label={label}
      className={cn("grid shrink-0 grid-cols-3 gap-2", className)}
    >
      {tiles.map((tile) => (
        <Link
          key={tile.id}
          to={tile.to}
          className={cn(
            "relative flex flex-col gap-1 rounded-md px-3 py-2.5 transition-colors",
            "hover:bg-muted/40 focus-visible:bg-muted/50 focus-visible:outline-none",
            tile.tone === "warn" && "text-warning",
            tile.tone === "muted" && "opacity-80"
          )}
        >
          {tile.hint ? (
            <span className="text-label-mono-sm text-muted-foreground absolute top-2.5 right-3">
              {tile.hint}
            </span>
          ) : null}
          <span
            className={cn(
              "text-heading-dossier font-semibold tracking-tight tabular-nums",
              tile.tone === "warn" && "text-warning",
              tile.hint && "pr-16"
            )}
          >
            {tile.value}
          </span>
          <span className="text-label-sm text-muted-foreground">
            {tile.label}
          </span>
        </Link>
      ))}
    </section>
  );
}

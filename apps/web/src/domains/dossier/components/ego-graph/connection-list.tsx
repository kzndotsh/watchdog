import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";

import { connectionRowActions } from "@/domains/dossier/lib/connection-row-actions";
import type { EdgeRecord } from "@/domains/entities/edges/edges.functions";
import { cn } from "@/lib/utils";
import { EntityMention } from "@/shared/ui/entity-mention";
import { TargetActionsHost } from "@/shared/ui/target-actions-host";
import { ConfidenceBadge, predicateLabel } from "@/shared/ui/vocab";

function ConnectionRow({
  edge,
  onEdit,
  onRemove,
}: {
  edge: EdgeRecord;
  onEdit: (edge: EdgeRecord) => void;
  onRemove: (edgeId: string) => void;
}) {
  const navigate = useNavigate();
  const peerLabel = edge.peerName || edge.peerId.slice(0, 8);
  const actions = useMemo(
    () =>
      connectionRowActions(edge, {
        onOpenPeer: (row) => {
          void navigate({
            to: "/entities/$entitySlug",
            params: { entitySlug: row.peerSlug },
            search: { tab: "connections" },
          });
        },
        onEdit,
        onRemove,
      }),
    [edge, navigate, onEdit, onRemove]
  );

  return (
    <li className="group">
      <TargetActionsHost
        actions={actions}
        label={`Actions for ${peerLabel}`}
        className="hover:bg-muted/40 flex items-start gap-2 px-3 py-2.5 transition-colors"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-muted-foreground shrink-0 text-xs">
              {predicateLabel(edge.predicate, edge.direction)}
            </span>
            <EntityMention
              name={peerLabel}
              slug={edge.peerSlug}
              tab="connections"
              className="min-w-0"
            />
            <ConfidenceBadge
              confidence={edge.confidence}
              className="text-chip shrink-0"
            />
          </div>
          {edge.notes?.trim() ? (
            <p className="text-muted-foreground line-clamp-2 text-xs">
              {edge.notes}
            </p>
          ) : null}
        </div>
      </TargetActionsHost>
    </li>
  );
}

function DirectionBlock({
  title,
  edges,
  onEdit,
  onRemove,
}: {
  title: string;
  edges: EdgeRecord[];
  onEdit: (edge: EdgeRecord) => void;
  onRemove: (edgeId: string) => void;
}) {
  if (edges.length === 0) {
    return null;
  }

  return (
    <li className="list-none">
      <div className="bg-muted/30 text-muted-foreground text-chip sticky top-0 z-10 border-b px-3 py-1.5 font-medium tracking-wide uppercase">
        <span className="flex items-center justify-between gap-2">
          {title}
          <span className="font-mono tabular-nums">{edges.length}</span>
        </span>
      </div>
      <ul className="divide-border divide-y">
        {edges.map((edge) => (
          <ConnectionRow
            key={edge.id}
            edge={edge}
            onEdit={onEdit}
            onRemove={onRemove}
          />
        ))}
      </ul>
    </li>
  );
}

export function CompactConnectionList({
  outbound,
  inbound,
  onEdit,
  onRemove,
  className,
}: {
  outbound: EdgeRecord[];
  inbound: EdgeRecord[];
  onEdit: (edge: EdgeRecord) => void;
  onRemove: (edgeId: string) => void;
  className?: string;
}) {
  if (outbound.length === 0 && inbound.length === 0) {
    return null;
  }

  return (
    <ul
      className={cn(
        "border-border max-h-64 overflow-y-auto rounded-lg border",
        className
      )}
    >
      <DirectionBlock
        title="Outbound"
        edges={outbound}
        onEdit={onEdit}
        onRemove={onRemove}
      />
      <DirectionBlock
        title="Inbound"
        edges={inbound}
        onEdit={onEdit}
        onRemove={onRemove}
      />
    </ul>
  );
}

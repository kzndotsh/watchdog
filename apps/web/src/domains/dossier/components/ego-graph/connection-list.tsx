import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";

import { RowHistory } from "@/domains/dossier/components/row-history";
import { connectionRowActions } from "@/domains/dossier/lib/connection-row-actions";
import type { EdgeRecord } from "@/domains/entities/edges/types";
import { cn } from "@/lib/utils";
import { useWorkCase } from "@/shared/hooks/use-route-case";
import { EntityMention } from "@/shared/ui/entity-mention";
import { TargetActionsHost } from "@/shared/ui/target-actions-host";
import { ConfidenceBadge, predicateLabel } from "@/shared/ui/vocab";
import { entityDisplayLabel } from "@watchdog/schemas/shared";

type ConnectionRowProps = {
  edge: EdgeRecord;
  onEdit: (edge: EdgeRecord) => void;
  onRemove: (edgeId: string) => void;
};

function ConnectionRow({ edge, onEdit, onRemove }: ConnectionRowProps) {
  const navigate = useNavigate();
  const { slug: caseSlug, id: caseId } = useWorkCase();
  const peerLabel = entityDisplayLabel({
    name: edge.peerName,
    slug: edge.peerSlug,
  });
  const actions = useMemo(
    () =>
      connectionRowActions(edge, {
        onOpenPeer: (row) => {
          void navigate({
            to: "/cases/$caseSlug/entities/$entitySlug",
            params: { caseSlug, entitySlug: row.peerSlug },
            search: { tab: "connections" },
          });
        },
        onEdit,
        onRemove,
      }),
    [edge, navigate, caseSlug, onEdit, onRemove]
  );

  return (
    <li className="group">
      <TargetActionsHost
        actions={actions}
        label={`Actions for ${peerLabel}`}
        className="hover:bg-muted/40 flex items-start gap-2 px-3 py-2.5 transition-colors"
        trailing={<RowHistory caseId={caseId} kind="edge" rowId={edge.id} />}
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
              className="shrink-0"
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

type DirectionBlockProps = {
  title: string;
  edges: EdgeRecord[];
  onEdit: (edge: EdgeRecord) => void;
  onRemove: (edgeId: string) => void;
};

function DirectionBlock({
  title,
  edges,
  onEdit,
  onRemove,
}: DirectionBlockProps) {
  if (edges.length === 0) {
    return null;
  }

  return (
    <li className="list-none">
      <div className="bg-muted/30 text-muted-foreground sticky top-0 z-10 border-b px-3 py-1.5 text-xs tracking-wide uppercase">
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

type CompactConnectionListProps = {
  outbound: EdgeRecord[];
  inbound: EdgeRecord[];
  onEdit: (edge: EdgeRecord) => void;
  onRemove: (edgeId: string) => void;
  className?: string;
};

export function CompactConnectionList({
  outbound,
  inbound,
  onEdit,
  onRemove,
  className,
}: CompactConnectionListProps) {
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

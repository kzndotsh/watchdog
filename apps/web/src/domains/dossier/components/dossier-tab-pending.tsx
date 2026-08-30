import type { ReactNode } from "react";

import { LoadingRegion } from "@/shared/ui/loading-region";
import { PendingRegion } from "@/shared/ui/pending-region";
import {
  BoardSkeletonLayout,
  DossierConnectionsSkeletonLayout,
  DossierEvidenceSkeletonLayout,
  DossierNotesSkeletonLayout,
  DossierOverviewSkeletonLayout,
  DossierPanelSkeletonLayout,
} from "@/shared/ui/skeletons";

function dossierHandFallback({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <LoadingRegion label={label} className={className}>
      {children}
    </LoadingRegion>
  );
}

export function dossierOverviewFallback() {
  return dossierHandFallback({
    label: "Loading overview",
    children: <DossierOverviewSkeletonLayout />,
  });
}

export function dossierNotesFallback() {
  return dossierHandFallback({
    label: "Loading notes",
    className: "flex min-h-0 flex-1 flex-col",
    children: <DossierNotesSkeletonLayout />,
  });
}

export function dossierClaimsFallback() {
  return dossierHandFallback({
    label: "Loading claims",
    children: <DossierPanelSkeletonLayout variant="list" />,
  });
}

export function dossierIdentifiersFallback() {
  return dossierHandFallback({
    label: "Loading identifiers",
    children: <DossierPanelSkeletonLayout variant="table" />,
  });
}

export function dossierConnectionsFallback() {
  return dossierHandFallback({
    label: "Loading connections",
    className: "flex min-h-0 flex-1 flex-col",
    children: <DossierConnectionsSkeletonLayout />,
  });
}

export function dossierEvidenceFallback() {
  return dossierHandFallback({
    label: "Loading evidence",
    children: <DossierEvidenceSkeletonLayout />,
  });
}

export function dossierEventsFallback() {
  return dossierHandFallback({
    label: "Loading events",
    children: <DossierPanelSkeletonLayout variant="timeline" />,
  });
}

export function dossierQuestionsFallback() {
  return dossierHandFallback({
    label: "Loading questions",
    children: <DossierPanelSkeletonLayout variant="list" />,
  });
}

export function dossierTasksFallback() {
  return (
    <PendingRegion
      loading
      label="Loading tasks"
      fallback={
        <div className="border-border flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border">
          <BoardSkeletonLayout />
        </div>
      }
      className="flex min-h-0 flex-1 flex-col"
    >
      {null}
    </PendingRegion>
  );
}

import { Link } from "@tanstack/react-router";
import { PencilIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { IntakeEvidenceActions } from "@/domains/intake/hooks/use-intake-actions";
import {
  evidenceTitle,
  type latestEnrichOutput,
} from "@/domains/intake/lib/evidence";
import type { EvidenceRecord } from "@/domains/intake/types";
import type { JobListRecord } from "@/domains/jobs/jobs.functions";
import {
  DetailContextHeader,
  DetailContextSep,
} from "@/shared/ui/detail-context-strip";
import { DetailStatusChip } from "@/shared/ui/detail-status-chip";
import { EntityCombobox, type EntityOption } from "@/shared/ui/entity-combobox";
import { Button } from "@/shared/ui/shadcn/button";
import { TabsList, TabsTrigger } from "@/shared/ui/shadcn/tabs";
import { TabCount } from "@/shared/ui/tab-count";
import { WithTooltip } from "@/shared/ui/timestamp";
import { StatusBadge, capabilityLabel } from "@/shared/ui/vocab";

type EvidenceLifecycleStatus = "cancelled" | "succeeded" | "pending";

function evidenceLifecycle(
  isHidden: boolean,
  processed: boolean
): { status: EvidenceLifecycleStatus; label: string } {
  if (isHidden) return { status: "cancelled", label: "hidden" };
  if (processed) return { status: "succeeded", label: "processed" };
  return { status: "pending", label: "unprocessed" };
}

function entityLabel(entityName: string | null | undefined): string {
  return entityName !== null && entityName !== undefined && entityName !== ""
    ? entityName
    : "Unattached";
}

function EvidenceEntityEditor({
  attachedId,
  entities,
  attaching,
  onAttachEntity,
  onClose,
}: {
  attachedId: string;
  entities: readonly EntityOption[];
  attaching: boolean;
  onAttachEntity: (entityId: string) => void;
  onClose: () => void;
}) {
  const editorRef = useRef<HTMLSpanElement>(null);

  function handleEntityChange(next: string) {
    onClose();
    if (next === attachedId) return;
    onAttachEntity(next);
  }

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (editorRef.current?.contains(target)) return;
      if (
        target instanceof Element &&
        target.closest("[data-slot=combobox-content]")
      ) {
        return;
      }
      onClose();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <span ref={editorRef} className="inline-flex items-center">
      <EntityCombobox
        entities={entities}
        value={attachedId}
        onValueChange={handleEntityChange}
        emptyLabel="Unattached"
        aria-label="Attach to entity"
        disabled={attaching}
        autoFocus
        showClear={false}
        className="h-6 w-44 [&_[data-slot=input-group-addon]]:py-0 [&_[data-slot=input-group-control]]:h-6"
      />
    </span>
  );
}

function EvidenceEntityMeta({
  entityName,
  attachedId,
  entities,
  attaching,
  isHidden,
  onAttachEntity,
}: {
  entityName?: string | null;
  attachedId: string;
  entities?: readonly EntityOption[];
  attaching: boolean;
  isHidden: boolean;
  onAttachEntity?: (entityId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const label = entityLabel(entityName);
  const canEdit =
    !isHidden && onAttachEntity !== undefined && entities !== undefined;

  function handleStartEdit() {
    setEditing(true);
  }

  const handleCloseEditor = useCallback(() => {
    setEditing(false);
  }, []);

  const slug =
    attachedId === ""
      ? undefined
      : entities?.find((ent) => ent.id === attachedId)?.slug;
  const nameClass =
    attachedId === "" ? "text-muted-foreground" : "text-foreground/80";
  const nameEl =
    slug !== undefined && slug !== "" ? (
      <Link
        to="/entities/$entitySlug"
        params={{ entitySlug: slug }}
        className="text-foreground/80 hover:text-foreground underline-offset-2 hover:underline"
      >
        {label}
      </Link>
    ) : (
      <span className={nameClass}>{label}</span>
    );

  if (!canEdit || entities === undefined || onAttachEntity === undefined) {
    return nameEl;
  }

  if (editing) {
    return (
      <EvidenceEntityEditor
        attachedId={attachedId}
        entities={entities}
        attaching={attaching}
        onAttachEntity={onAttachEntity}
        onClose={handleCloseEditor}
      />
    );
  }

  return (
    <span className="inline-flex min-w-0 items-center gap-0.5">
      {nameEl}
      <WithTooltip content="Change entity" wrapSpan>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground size-5 [&_svg]:size-2.5"
          aria-label="Change entity"
          disabled={attaching}
          onClick={handleStartEdit}
        >
          <PencilIcon />
        </Button>
      </WithTooltip>
    </span>
  );
}

export function EvidenceHeaderActions({
  isHidden,
  actions,
  canEnrich,
  processed,
  allowThirdPartyEgress = false,
  onHideRequested,
}: {
  isHidden: boolean;
  actions: IntakeEvidenceActions;
  canEnrich: boolean;
  processed: boolean;
  allowThirdPartyEgress?: boolean;
  onHideRequested: () => void;
}) {
  const {
    busy,
    processing,
    aiProcessing,
    enriching,
    onProcess,
    onAiProcess,
    onEnrich,
    onRestore,
  } = actions;

  if (isHidden) {
    return (
      <Button
        type="button"
        size="sm"
        className="h-7"
        disabled={busy}
        onClick={onRestore}
      >
        Restore
      </Button>
    );
  }

  const aiDisabled = busy || processed || !allowThirdPartyEgress;

  return (
    <>
      {canEnrich ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7"
          loading={enriching}
          disabled={busy}
          onClick={onEnrich}
        >
          Enrich
        </Button>
      ) : null}
      <Button
        type="button"
        size="sm"
        className="h-7"
        loading={processing}
        disabled={busy || processed}
        onClick={onProcess}
      >
        Harvest
      </Button>
      <WithTooltip
        content={
          allowThirdPartyEgress
            ? "LLM extract → Triage Proposal"
            : "Needs Case third-party egress (Cases → edit)."
        }
        wrapSpan={aiDisabled}
      >
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7"
          loading={aiProcessing}
          disabled={aiDisabled}
          onClick={onAiProcess}
        >
          Extract (AI)
        </Button>
      </WithTooltip>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7"
        disabled={busy}
        onClick={onHideRequested}
      >
        Hide
      </Button>
    </>
  );
}

export function EvidenceDetailHeader({
  evidence,
  isHidden,
  processed,
  producingCap,
  entityName,
  entities,
  canEnrich,
  enrichJobs,
  enrichOutput,
  relatedJobs,
  attaching = false,
  onAttachEntity,
  onShowProducingRun,
}: {
  evidence: EvidenceRecord;
  isHidden: boolean;
  processed: boolean;
  producingCap: JobListRecord | null;
  entityName?: string | null;
  entities?: readonly EntityOption[];
  canEnrich: boolean;
  enrichJobs: JobListRecord[];
  enrichOutput: ReturnType<typeof latestEnrichOutput>;
  relatedJobs: JobListRecord[];
  attaching?: boolean;
  onAttachEntity?: (entityId: string) => void;
  onShowProducingRun?: (jobId: string) => void;
}) {
  const lifecycle = evidenceLifecycle(isHidden, processed);
  const attachedId = evidence.entityId ?? "";

  return (
    <header className="border-border flex shrink-0 flex-col">
      {isHidden ? (
        <p className="text-muted-foreground border-border/60 bg-muted/20 border-b px-4 py-1.5 text-xs">
          Soft-deleted from the active queue. Restore to Harvest, Extract, or
          Enrich again.
        </p>
      ) : null}

      <DetailContextHeader>
        <span className="text-foreground/80 inline-flex min-w-0 items-center gap-1">
          <span className="text-muted-foreground shrink-0">Entity</span>
          <EvidenceEntityMeta
            entityName={entityName}
            attachedId={attachedId}
            entities={entities}
            attaching={attaching}
            isHidden={isHidden}
            onAttachEntity={onAttachEntity}
          />
        </span>
        {producingCap === null ? null : (
          <>
            <DetailContextSep />
            <span className="inline-flex min-w-0 items-center gap-1">
              <span className="shrink-0">From</span>
              <Button
                type="button"
                variant="link"
                className="text-foreground/80 h-auto min-h-0 p-0 text-xs font-normal underline-offset-2 hover:underline"
                onClick={() => {
                  onShowProducingRun?.(producingCap.id);
                }}
              >
                {capabilityLabel(producingCap.capabilityId)}
              </Button>
            </span>
          </>
        )}
        <DetailContextSep />
        <StatusBadge status={lifecycle.status} size="md">
          {lifecycle.label}
        </StatusBadge>
        {producingCap === null ? null : (
          <DetailStatusChip>Cap output</DetailStatusChip>
        )}
      </DetailContextHeader>
      <span className="sr-only">{evidenceTitle(evidence)}</span>

      <div className="border-border border-b px-2 pb-0">
        <TabsList variant="line" className="h-8">
          <TabsTrigger value="content">Content</TabsTrigger>
          {canEnrich || enrichJobs.length > 0 ? (
            <TabsTrigger value="output" className="gap-1">
              Output
              {enrichOutput ? <TabCount n={1} /> : null}
            </TabsTrigger>
          ) : null}
          <TabsTrigger value="jobs" className="gap-1">
            Jobs
            <TabCount n={relatedJobs.length} />
          </TabsTrigger>
        </TabsList>
      </div>
    </header>
  );
}

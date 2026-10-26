import { useMemo, useState } from "react";

import {
  ClaimActionForm,
  type ActionState,
  type ClaimAction,
} from "@/domains/dossier/components/claim-action-form";
import { ClaimComposer } from "@/domains/dossier/components/claim-composer";
import { DossierSection } from "@/domains/dossier/components/dossier-section";
import { DossierSectionAddButton } from "@/domains/dossier/components/dossier-section-add-button";
import { rowHistorySlot } from "@/domains/dossier/components/row-history-slot";
import { useCreateClaim } from "@/domains/dossier/hooks/use-create-claim";
import { useDossierSectionEditor } from "@/domains/dossier/hooks/use-dossier-section-editor";
import {
  useSectionListView,
  type SectionListView,
} from "@/domains/dossier/hooks/use-section-list-view";
import { useUpdateClaim } from "@/domains/dossier/hooks/use-update-claim";
import {
  claimDefaultsFromRow,
  claimFormOptions,
  type ClaimFormValues,
} from "@/domains/dossier/lib/claim-form";
import { claimRowActions } from "@/domains/dossier/lib/claim-row-actions";
import type { DossierClaimsSearch } from "@/domains/dossier/lib/dossier-tabs";
import type {
  DossierEntityScope,
  DossierSectionWithEvidenceProps,
} from "@/domains/dossier/types";
import { claimListView } from "@/domains/entities/claims/queries";
import type { ClaimRecord } from "@/domains/entities/claims/types";
import { evidencePickerPort } from "@/domains/intake/queries";
import { cn } from "@/lib/utils";
import { useList } from "@/shared/hooks/list/use-list";
import { useListDisplay } from "@/shared/hooks/list/use-list-display";
import {
  useRecordsByIds,
  type PickerPort,
} from "@/shared/hooks/use-picker-source";
import { ClickableIdChip } from "@/shared/ui/clickable-id-chip";
import {
  evidenceLabel,
  type EvidenceOption,
} from "@/shared/ui/intake/evidence-option";
import { ListBody, ListToolbar } from "@/shared/ui/list";
import { DossierPanelSkeletonLayout } from "@/shared/ui/skeletons";
import { TargetActionsHost } from "@/shared/ui/target-actions-host";
import {
  ClaimClassBadge,
  ConfidenceBadge,
  StatusBadge,
} from "@/shared/ui/vocab";
import type { claimList } from "@watchdog/schemas/graph";
import type { UnfixedSearchPatch } from "@watchdog/schemas/shared";
import { FieldError } from "@watchdog/ui/components/field";

function evidenceTitleOf(
  titles: ReadonlyMap<string, EvidenceOption>,
  id: string
): string | undefined {
  const row = titles.get(id);
  return row === undefined ? undefined : evidenceLabel(row);
}

/** The Claims tab's view in the route's URL (the Overview's nest keeps its own). */
export type ClaimsSectionView = SectionListView<
  DossierClaimsSearch,
  UnfixedSearchPatch<typeof claimList, "entityId">
>;

export type ClaimsSectionProps = DossierSectionWithEvidenceProps & {
  /** The tab's URL view and toolbar; without it the section shows the default view. */
  view?: ClaimsSectionView;
};

const NO_SEARCH: DossierClaimsSearch = {};

type ClaimRowProps = {
  row: ClaimRecord;
  index: number;
  scope: DossierEntityScope;
  caseId: string;
  editor: ReturnType<typeof useDossierSectionEditor>;
  evidencePort: PickerPort<EvidenceOption>;
  evidenceTitles: ReadonlyMap<string, EvidenceOption>;
  actionState: ActionState;
  onEvidenceClick?: (evidenceId: string) => void;
  onEdit: (row: ClaimRecord) => void;
  onAction: (claimId: string, action: ClaimAction) => void;
  onActionDone: () => void;
  onSaveEdit: (row: ClaimRecord, value: ClaimFormValues) => Promise<void>;
};

/** One Claim: its text (or the inline editor), badges, linked Evidence and its action form. */
function ClaimRow({
  row,
  index,
  scope,
  caseId,
  editor,
  evidencePort,
  evidenceTitles,
  actionState,
  onEvidenceClick,
  onEdit,
  onAction,
  onActionDone,
  onSaveEdit,
}: ClaimRowProps) {
  // A retracted Claim (the Retracted view) is history: no edit, no second retraction.
  const actions = row.retracted
    ? []
    : claimRowActions(row, { onEdit, onAction });
  return (
    <li className="group flex flex-col gap-1.5">
      <TargetActionsHost
        actions={editor.editId === row.id ? [] : actions}
        label="Claim actions"
        className="flex items-start gap-2 text-sm"
        trailing={rowHistorySlot(caseId, "claim", row.id)}
      >
        <span className="text-muted-foreground w-4 shrink-0 pt-0.5 text-xs tabular-nums">
          {index + 1}.
        </span>
        <div className="min-w-0 flex-1">
          {editor.editId === row.id ? (
            <ClaimComposer
              key={row.id}
              defaultValues={claimDefaultsFromRow(row)}
              evidencePort={evidencePort}
              shell="inline"
              submitLabel="Save"
              onCancel={editor.handleCloseEdit}
              onError={editor.handleError}
              onSubmit={async (value) => {
                await onSaveEdit(row, value);
              }}
            />
          ) : (
            <p
              className={cn(
                "leading-snug break-words whitespace-pre-wrap",
                row.retracted && "text-muted-foreground line-through"
              )}
            >
              {row.text}
            </p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm leading-tight">
            <ClaimClassBadge claimClass={row.class} />
            <ConfidenceBadge confidence={row.confidence} />
            {row.retracted ? (
              <StatusBadge status={row.retractKind ?? "retracted"} />
            ) : null}
            {row.evidenceIds.length > 0 ? (
              <span className="flex flex-wrap gap-1">
                {row.evidenceIds.map((id) => (
                  <ClickableIdChip
                    key={id}
                    value={id}
                    display={evidenceTitleOf(evidenceTitles, id)}
                    onClick={onEvidenceClick}
                  />
                ))}
              </span>
            ) : null}
          </div>
        </div>
      </TargetActionsHost>

      {actionState?.claimId === row.id ? (
        <ClaimActionForm
          key={`${row.id}-${actionState.action}`}
          scope={scope}
          claimId={row.id}
          action={actionState.action}
          onCancel={onActionDone}
          onError={editor.handleError}
          onSaved={onActionDone}
        />
      ) : null}
    </li>
  );
}

/**
 * An Entity's Claims: the Case's Claim list with `entityId` fixed (ADR-0007), a page at a time.
 * The tab shows the toolbar and keeps its view in the URL; the Overview's nest shows the default
 * view (the live Claims) without one.
 */
export function ClaimsSection({
  caseId,
  entityId,
  entitySlug,
  onEvidenceClick,
  emptyPresentation = "inline",
  view,
}: ClaimsSectionProps) {
  const scope = { caseId, entityId, entitySlug };
  const { search, onSearchChange } = useSectionListView(view, NO_SEARCH);
  const list = useList(claimListView, {
    scope: { caseId },
    fixed: { entityId },
    search,
    onSearchChange,
  });
  const display = useListDisplay("dossier-claims");
  const evidencePort = useMemo(() => evidencePickerPort(caseId), [caseId]);
  // Titles of the Evidence the loaded Claims link: a by-ids read of exactly those ids (#559).
  const evidenceTitles = useRecordsByIds(
    evidencePort,
    list.rows.flatMap((row) => row.evidenceIds)
  );

  const [actionState, setActionState] = useState<ActionState>(null);
  const editor = useDossierSectionEditor();

  const createMutation = useCreateClaim({
    onCreated: editor.handleStopAdding,
  });

  const updateMutation = useUpdateClaim({
    onUpdated: editor.handleCloseEdit,
    onReload: editor.handleCloseEdit,
  });

  function handleAction(claimId: string, action: ClaimAction) {
    setActionState({ claimId, action });
    editor.handleCloseEdit();
  }

  function handleEdit(row: ClaimRecord) {
    setActionState(null);
    editor.handleOpenEdit(row.id, row.version);
  }

  const isPanel = emptyPresentation === "panel";
  const addButton = (
    <DossierSectionAddButton
      variant="panel"
      noun="claim"
      onClick={editor.handleStartAdding}
    />
  );

  return (
    <DossierSection
      title="Claims"
      isEmpty={!isPanel && list.status === "blank" && !editor.isAdding}
      emptyPresentation={emptyPresentation}
      emptyText="No claims yet — add one or run a Capability."
      actions={
        <DossierSectionAddButton
          variant="ghost"
          onClick={editor.handleToggleAdding}
        />
      }
      shouldFill={isPanel}
    >
      <FieldError>{editor.error}</FieldError>

      {editor.isAdding ? (
        <ClaimComposer
          key="create"
          defaultValues={claimFormOptions.defaultValues}
          evidencePort={evidencePort}
          shell="composer"
          submitLabel="Save"
          textPlaceholder="Claim text"
          onCancel={editor.handleStopAdding}
          onError={editor.handleError}
          onSubmit={async (value) => {
            await createMutation.mutateAsync({ ...scope, value });
          }}
        />
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        {view === undefined ? null : (
          <ListToolbar list={list} display={display} />
        )}
        <ListBody
          list={list}
          skeleton={
            isPanel ? <DossierPanelSkeletonLayout variant="list" /> : null
          }
          blankSlateAction={addButton}
        >
          {(rows) => (
            <ol
              className={cn(
                "flex flex-col",
                display.density === "compact" ? "gap-1" : "gap-2"
              )}
            >
              {rows.map((row, index) => (
                <ClaimRow
                  key={row.id}
                  row={row}
                  index={index}
                  scope={scope}
                  caseId={caseId}
                  editor={editor}
                  evidencePort={evidencePort}
                  evidenceTitles={evidenceTitles}
                  actionState={actionState}
                  onEvidenceClick={onEvidenceClick}
                  onEdit={handleEdit}
                  onAction={handleAction}
                  onActionDone={() => {
                    setActionState(null);
                  }}
                  onSaveEdit={async (target, value) => {
                    await updateMutation.mutateAsync({
                      ...scope,
                      claimId: target.id,
                      expectedVersion: editor.editVersion ?? target.version,
                      value,
                    });
                  }}
                />
              ))}
            </ol>
          )}
        </ListBody>
      </div>
    </DossierSection>
  );
}

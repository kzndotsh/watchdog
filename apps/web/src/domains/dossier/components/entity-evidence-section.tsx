import { ClipboardPasteIcon, FileUpIcon, LinkIcon } from "lucide-react";
import { useState } from "react";

import { EvidencePreviewDrawer } from "@/domains/dossier/components/evidence-preview-drawer";
import { useSelectedEvidence } from "@/domains/dossier/hooks/use-selected-evidence";
import type { DossierEvidenceSearch } from "@/domains/dossier/lib/dossier-tabs";
import {
  DumpDialogs,
  type DumpModal,
} from "@/domains/intake/components/dump-dialogs";
import { FileDropZone } from "@/domains/intake/components/file-drop-zone";
import { useDumpEvidence } from "@/domains/intake/hooks/use-dump-evidence";
import { evidenceTitle } from "@/domains/intake/lib/evidence";
import { evidenceListView } from "@/domains/intake/queries";
import type { EvidenceRecord } from "@/domains/intake/types";
import { useList } from "@/shared/hooks/list/use-list";
import { useListDisplay } from "@/shared/hooks/list/use-list-display";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { evidenceSourceFootnote } from "@/shared/ui/intake/evidence-option";
import { ListBody, ListToolbar } from "@/shared/ui/list";
import { Button } from "@/shared/ui/primitives/button";
import { QueueRow } from "@/shared/ui/queue-row";
import { RelativeTime } from "@/shared/ui/relative-time";
import { QueueSkeleton } from "@/shared/ui/skeletons";
import { KindBadge } from "@/shared/ui/vocab";
import type { evidenceList } from "@watchdog/schemas/evidence";
import type { UnfixedSearchPatch } from "@watchdog/schemas/shared";
import { ButtonGroup } from "@watchdog/ui/components/button-group";
import { FieldError } from "@watchdog/ui/components/field";

const DUMP_KINDS = [
  { kind: "file" as const, label: "File", Icon: FileUpIcon },
  { kind: "paste" as const, label: "Paste", Icon: ClipboardPasteIcon },
  { kind: "url" as const, label: "URL", Icon: LinkIcon },
];

type DumpKindButtonsProps = {
  disabled: boolean;
  onDump: (kind: DumpModal) => void;
  variant: "outline" | "ghost";
};

function DumpKindButtons({ disabled, onDump, variant }: DumpKindButtonsProps) {
  const isGhost = variant === "ghost";
  const buttons = DUMP_KINDS.map(({ kind, label, Icon }) => (
    <Button
      key={kind}
      type="button"
      size={isGhost ? "sm" : "default"}
      variant={variant}
      disabled={disabled}
      onClick={() => {
        onDump(kind);
      }}
    >
      {isGhost ? <Icon className="size-3" /> : null}
      {label}
    </Button>
  ));

  if (isGhost) {
    return (
      <div
        className="flex items-center gap-1"
        role="group"
        aria-label="Dump evidence"
      >
        {buttons}
      </div>
    );
  }

  return <ButtonGroup aria-label="Dump evidence">{buttons}</ButtonGroup>;
}

function EvidenceRow({ row }: { row: EvidenceRecord }) {
  const label = evidenceTitle(row);
  const sourceFootnote = evidenceSourceFootnote(row, label);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <KindBadge kind={row.kind} />
        <span className="text-foreground min-w-0 truncate text-sm">
          {label}
        </span>
        {row.processedAt === null ? (
          <span className="text-warning text-sm leading-tight">
            Unprocessed
          </span>
        ) : (
          <span className="text-success text-sm leading-tight">Processed</span>
        )}
      </div>
      <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-sm leading-tight">
        {row.mime !== null && row.mime !== "" ? (
          <span className="text-2xs font-mono">{row.mime}</span>
        ) : null}
        <RelativeTime value={row.capturedAt} />
        {sourceFootnote === null ? null : (
          <span className="text-2xs truncate font-mono">{sourceFootnote}</span>
        )}
      </div>
    </>
  );
}

type EntityEvidenceSectionProps = {
  caseId: string;
  entityId: string;
  /** The tab's view from the route (`entityId` is fixed, never in the URL). */
  search: DossierEvidenceSearch;
  onSearchChange: (
    patch: UnfixedSearchPatch<typeof evidenceList, "entityId"> & {
      readonly id?: string | undefined;
    }
  ) => void;
};

/**
 * The Dossier Evidence tab: the Case's Evidence list with `entityId` fixed (ADR-0007), as a
 * queue body, a page at a time. The selected row is `?id=`; when it is not on a loaded page it
 * resolves through `evidence.get` (`useSelectedEvidence`: a gone row clears `?id=`, a failed
 * read shows Retry and Clear selection).
 */
export function EntityEvidenceSection({
  caseId,
  entityId,
  search,
  onSearchChange,
}: EntityEvidenceSectionProps) {
  const list = useList(evidenceListView, {
    scope: { caseId },
    fixed: { entityId },
    search,
    onSearchChange,
  });
  const display = useListDisplay("dossier-evidence");
  const selection = useSelectedEvidence({
    caseId,
    selectedId: search.id ?? null,
    rows: list.rows,
    isListSettled: list.status !== "pending",
    onClear: () => {
      onSearchChange({ id: undefined });
    },
  });
  const selectedId = search.id ?? null;
  const handleRetrySelection = selection.retry;
  const [dumpModal, setDumpModal] = useState<DumpModal | null>(null);

  const dump = useDumpEvidence({
    caseId,
    entityId,
    onSuccess: () => {
      setDumpModal(null);
    },
  });
  const handleFiles = dump.onFiles;
  const handlePaste = dump.onPaste;
  const handleUrl = dump.onUrl;
  const uploadStatus =
    dump.uploadStatus !== null && dump.uploadStatus !== "" ? (
      <p className="text-muted-foreground text-xs">{dump.uploadStatus}</p>
    ) : null;

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <ListToolbar
          list={list}
          display={display}
          actions={
            <DumpKindButtons
              disabled={dump.busy}
              onDump={setDumpModal}
              variant="ghost"
            />
          }
        />
        {list.status === "blank" ? null : (
          <FileDropZone disabled={dump.busy} onFiles={handleFiles} />
        )}
        {list.status === "blank" ? null : uploadStatus}
        {selection.error === null ? null : (
          <div className="flex flex-col gap-2">
            <FetchErrorAlert
              error={selection.error}
              onRetry={handleRetrySelection}
            />
            <div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  onSearchChange({ id: undefined });
                }}
              >
                Clear selection
              </Button>
            </div>
          </div>
        )}
        <ListBody
          list={list}
          skeleton={<QueueSkeleton />}
          blankSlateAction={
            <div className="flex w-full max-w-md flex-col items-center gap-4">
              <FileDropZone disabled={dump.busy} onFiles={handleFiles} />
              {uploadStatus}
              <DumpKindButtons
                disabled={dump.busy}
                onDump={setDumpModal}
                variant="outline"
              />
            </div>
          }
        >
          {(rows) => (
            <div
              role="listbox"
              aria-label="Evidence"
              className="divide-border border-border divide-y overflow-hidden rounded-md border"
            >
              {rows.map((row) => (
                <QueueRow
                  key={row.id}
                  isSelected={row.id === selectedId}
                  className={
                    display.density === "compact" ? "py-0.5" : "py-2.5"
                  }
                  onClick={() => {
                    onSearchChange({ id: row.id });
                  }}
                >
                  <EvidenceRow row={row} />
                </QueueRow>
              ))}
            </div>
          )}
        </ListBody>
      </div>
      <FieldError>{dump.dumpError}</FieldError>
      <DumpDialogs
        open={dumpModal}
        onOpenChange={setDumpModal}
        isBusy={dump.busy}
        isUploading={dump.uploading}
        isDumpingPaste={dump.dumpingPaste}
        isDumpingUrl={dump.dumpingUrl}
        uploadStatus={dump.uploadStatus}
        entityId={entityId}
        isEntityLocked
        onFiles={handleFiles}
        onPaste={handlePaste}
        onUrl={handleUrl}
      />
      <EvidencePreviewDrawer
        evidence={selection.selected}
        caseId={caseId}
        onClose={() => {
          onSearchChange({ id: undefined });
        }}
      />
    </>
  );
}

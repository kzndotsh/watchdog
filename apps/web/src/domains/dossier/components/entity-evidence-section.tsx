import { ClipboardPasteIcon, FileUpIcon, LinkIcon } from "lucide-react";
import { useState } from "react";

import { DossierSection } from "@/domains/dossier/components/dossier-section";
import type { DossierEmptyPresentation } from "@/domains/dossier/types";
import {
  DumpDialogs,
  type DumpModal,
} from "@/domains/intake/components/dump-dialogs";
import { FileDropZone } from "@/domains/intake/components/file-drop-zone";
import { useDumpEvidence } from "@/domains/intake/hooks/use-dump-evidence";
import type { EvidenceRecord } from "@/domains/intake/types";
import { FormInlineError } from "@/shared/ui/form-inline-message";
import { IdChip } from "@/shared/ui/id-chip";
import { RelativeTime } from "@/shared/ui/relative-time";
import { Button } from "@/shared/ui/shadcn/button";
import { ButtonGroup } from "@/shared/ui/shadcn/button-group";
import { KindBadge } from "@/shared/ui/vocab";

const DUMP_KINDS = [
  { kind: "file" as const, label: "File", Icon: FileUpIcon },
  { kind: "paste" as const, label: "Paste", Icon: ClipboardPasteIcon },
  { kind: "url" as const, label: "URL", Icon: LinkIcon },
];

function DumpKindButtons({
  disabled,
  onDump,
  variant,
}: {
  disabled: boolean;
  onDump: (kind: DumpModal) => void;
  variant: "outline" | "ghost";
}) {
  const ghost = variant === "ghost";
  const buttons = DUMP_KINDS.map(({ kind, label, Icon }) => (
    <Button
      key={kind}
      type="button"
      size="sm"
      variant={variant}
      className={ghost ? "h-6 gap-1 px-2 text-xs" : undefined}
      disabled={disabled}
      onClick={() => {
        onDump(kind);
      }}
    >
      {ghost ? <Icon className="size-3" /> : null}
      {label}
    </Button>
  ));

  if (ghost) {
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

/** Entity-scoped evidence list. Parent owns Case Evidence fetch. */
export function EntityEvidenceSection({
  caseId,
  entityId,
  evidenceOptions,
  onEvidenceClick,
  emptyPresentation = "inline",
}: {
  caseId: string;
  entityId: string;
  evidenceOptions: readonly EvidenceRecord[];
  onEvidenceClick?: (evidenceId: string) => void;
  emptyPresentation?: DossierEmptyPresentation;
}) {
  const rows = evidenceOptions.filter((r) => r.entityId === entityId);
  const isEmpty = rows.length === 0;
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
  const handleDump = setDumpModal;

  return (
    <>
      <DossierSection
        title="Evidence"
        empty={isEmpty}
        emptyPresentation={emptyPresentation}
        emptyItems="evidence"
        emptyText="No evidence attached yet — dump a file, paste, or URL."
        emptyDescription="Dumps attach to this subject. Process and Enrich stay on Intake."
        emptyAction={
          emptyPresentation === "panel" ? (
            <div className="flex w-full max-w-md flex-col items-center gap-4">
              <FileDropZone disabled={dump.busy} onFiles={handleFiles} />
              {dump.uploadStatus !== null && dump.uploadStatus !== "" ? (
                <p className="text-muted-foreground text-xs">
                  {dump.uploadStatus}
                </p>
              ) : null}
              <DumpKindButtons
                disabled={dump.busy}
                onDump={handleDump}
                variant="outline"
              />
            </div>
          ) : undefined
        }
        actions={
          isEmpty ? undefined : (
            <DumpKindButtons
              disabled={dump.busy}
              onDump={handleDump}
              variant="ghost"
            />
          )
        }
      >
        <div className="flex flex-col gap-3">
          <FileDropZone disabled={dump.busy} onFiles={handleFiles} />
          {dump.uploadStatus !== null && dump.uploadStatus !== "" ? (
            <p className="text-muted-foreground text-xs">{dump.uploadStatus}</p>
          ) : null}
          <ul className="divide-border border-border divide-y overflow-hidden rounded-md border">
            {rows.map((row) => {
              const label = row.label ?? row.sourceUrl ?? row.uri ?? "Untitled";
              const clickable = Boolean(onEvidenceClick);
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    disabled={!clickable}
                    onClick={() => onEvidenceClick?.(row.id)}
                    className="hover:bg-muted/40 flex w-full flex-col gap-1 px-3 py-2.5 text-left transition-colors disabled:cursor-default disabled:hover:bg-transparent"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <IdChip value={row.id} head={8} tail={0} />
                      <KindBadge kind={row.kind} />
                      <span className="text-foreground min-w-0 truncate text-sm font-medium">
                        {label}
                      </span>
                      {row.processedAt === null ? (
                        <span className="text-label-sm text-warning">
                          Unprocessed
                        </span>
                      ) : (
                        <span className="text-label-sm text-success">
                          Processed
                        </span>
                      )}
                    </div>
                    <div className="text-label-sm text-muted-foreground flex flex-wrap items-center gap-3">
                      {row.mime !== null && row.mime !== "" ? (
                        <span className="text-label-mono-sm">{row.mime}</span>
                      ) : null}
                      <RelativeTime value={row.capturedAt} />
                      {row.sourceUrl !== null && row.sourceUrl !== "" ? (
                        <span className="text-label-mono-sm truncate">
                          {row.sourceUrl}
                        </span>
                      ) : null}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </DossierSection>
      <FormInlineError>{dump.dumpError}</FormInlineError>
      <DumpDialogs
        open={dumpModal}
        onOpenChange={handleDump}
        busy={dump.busy}
        uploading={dump.uploading}
        dumpingPaste={dump.dumpingPaste}
        dumpingUrl={dump.dumpingUrl}
        uploadStatus={dump.uploadStatus}
        entityId={entityId}
        entityLocked
        onFiles={handleFiles}
        onPaste={handlePaste}
        onUrl={handleUrl}
      />
    </>
  );
}

import { useId } from "react";

import { FileDropZone } from "@/domains/intake/components/file-drop-zone";
import { PasteForm } from "@/domains/intake/components/paste-form";
import { UrlForm } from "@/domains/intake/components/url-form";
import { EntityCombobox, type EntityOption } from "@/shared/ui/entity-combobox";
import { Button } from "@/shared/ui/primitives/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/primitives/dialog";
import { Field, FieldLabel } from "@watchdog/ui/components/field";

const EMPTY_DUMP_ENTITIES: EntityOption[] = [];

export type DumpModal = "file" | "paste" | "url";

export interface DumpDialogsProps {
  open: DumpModal | null;
  onOpenChange: (next: DumpModal | null) => void;
  busy: boolean;
  uploading: boolean;
  dumpingPaste: boolean;
  dumpingUrl: boolean;
  uploadStatus: string | null;
  entities?: EntityOption[];
  entityId: string;
  onEntityIdChange?: (id: string) => void;
  entityLocked?: boolean;
  onFiles: (files: FileList | File[]) => void;
  onPaste: (data: { body: string; label?: string; sourceUrl?: string }) => void;
  onUrl: (data: { sourceUrl: string; label?: string }) => void;
}

function AssociationField({
  entities,
  entityId,
  onEntityIdChange,
  disabled,
}: {
  entities: EntityOption[];
  entityId: string;
  onEntityIdChange: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <Field>
      <FieldLabel>Associate with</FieldLabel>
      <EntityCombobox
        entities={entities}
        value={entityId}
        onValueChange={onEntityIdChange}
        emptyLabel="Unattached"
        aria-label="Target entity"
        disabled={disabled}
        className="w-full"
      />
    </Field>
  );
}

export function DumpDialogs({
  open,
  onOpenChange,
  busy,
  uploading,
  dumpingPaste,
  dumpingUrl,
  uploadStatus,
  entities = EMPTY_DUMP_ENTITIES,
  entityId,
  onEntityIdChange,
  entityLocked = false,
  onFiles,
  onPaste,
  onUrl,
}: DumpDialogsProps) {
  const pasteFormId = useId();
  const urlFormId = useId();
  const association =
    !entityLocked && onEntityIdChange ? (
      <AssociationField
        entities={entities}
        entityId={entityId}
        onEntityIdChange={onEntityIdChange}
        disabled={busy}
      />
    ) : null;

  return (
    <>
      <Dialog
        open={open === "file"}
        onOpenChange={(next) => {
          if (!uploading) onOpenChange(next ? "file" : null);
        }}
      >
        <DialogContent className="sm:max-w-lg" showCloseButton={!uploading}>
          <DialogHeader>
            <DialogTitle>Upload files</DialogTitle>
            <DialogDescription>
              Drop or choose files. One Evidence row per file · max 100 MB.
            </DialogDescription>
          </DialogHeader>
          {association}
          <FileDropZone disabled={busy} onFiles={onFiles} />
          {uploadStatus !== null && uploadStatus !== "" ? (
            <p className="text-muted-foreground text-xs">{uploadStatus}</p>
          ) : null}
          <DialogFooter showCloseButton={!uploading} />
        </DialogContent>
      </Dialog>

      <Dialog
        open={open === "paste"}
        onOpenChange={(next) => {
          if (!dumpingPaste) onOpenChange(next ? "paste" : null);
        }}
      >
        <DialogContent className="sm:max-w-lg" showCloseButton={!dumpingPaste}>
          <DialogHeader>
            <DialogTitle>Paste evidence</DialogTitle>
            <DialogDescription>
              Paste page text, tool output, or notes into the active Case.
            </DialogDescription>
          </DialogHeader>
          {association}
          <PasteForm
            formId={pasteFormId}
            showSubmit={false}
            disabled={busy}
            loading={dumpingPaste}
            onSubmit={onPaste}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={dumpingPaste}
              onClick={() => {
                onOpenChange(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form={pasteFormId}
              size="sm"
              loading={dumpingPaste}
              disabled={busy}
            >
              Add Evidence
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={open === "url"}
        onOpenChange={(next) => {
          if (!dumpingUrl) onOpenChange(next ? "url" : null);
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton={!dumpingUrl}>
          <DialogHeader>
            <DialogTitle>Add URL</DialogTitle>
            <DialogDescription>
              Saves link metadata as Evidence. Use Enrich on the row to fetch
              live + Wayback.
            </DialogDescription>
          </DialogHeader>
          {association}
          <UrlForm
            formId={urlFormId}
            showSubmit={false}
            showHint={false}
            disabled={busy}
            loading={dumpingUrl}
            onSubmit={onUrl}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={dumpingUrl}
              onClick={() => {
                onOpenChange(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form={urlFormId}
              size="sm"
              loading={dumpingUrl}
              disabled={busy}
            >
              Add link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

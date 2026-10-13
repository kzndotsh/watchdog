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

export type DumpDialogsProps = {
  open: DumpModal | null;
  onOpenChange: (next: DumpModal | null) => void;
  isBusy: boolean;
  isUploading: boolean;
  isDumpingPaste: boolean;
  isDumpingUrl: boolean;
  uploadStatus: string | null;
  entities?: EntityOption[];
  entityId: string;
  onEntityIdChange?: (id: string) => void;
  isEntityLocked?: boolean;
  onFiles: (files: FileList | File[]) => void;
  onPaste: (data: { body: string; label?: string; sourceUrl?: string }) => void;
  onUrl: (data: { sourceUrl: string; label?: string }) => void;
};

type AssociationFieldProps = {
  entities: EntityOption[];
  entityId: string;
  onEntityIdChange: (id: string) => void;
  disabled: boolean;
};

function AssociationField({
  entities,
  entityId,
  onEntityIdChange,
  disabled,
}: AssociationFieldProps) {
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
  isBusy,
  isUploading,
  isDumpingPaste,
  isDumpingUrl,
  uploadStatus,
  entities = EMPTY_DUMP_ENTITIES,
  entityId,
  onEntityIdChange,
  isEntityLocked = false,
  onFiles,
  onPaste,
  onUrl,
}: DumpDialogsProps) {
  const pasteFormId = useId();
  const urlFormId = useId();
  const association =
    !isEntityLocked && onEntityIdChange ? (
      <AssociationField
        entities={entities}
        entityId={entityId}
        onEntityIdChange={onEntityIdChange}
        disabled={isBusy}
      />
    ) : null;

  return (
    <>
      <Dialog
        open={open === "file"}
        onOpenChange={(next) => {
          if (!isUploading) onOpenChange(next ? "file" : null);
        }}
      >
        <DialogContent className="sm:max-w-lg" showCloseButton={!isUploading}>
          <DialogHeader>
            <DialogTitle>Upload files</DialogTitle>
            <DialogDescription>
              Drop or choose files. One Evidence row per file · max 100 MB.
            </DialogDescription>
          </DialogHeader>
          {association}
          <FileDropZone disabled={isBusy} onFiles={onFiles} />
          {uploadStatus !== null && uploadStatus !== "" ? (
            <p className="text-muted-foreground text-xs">{uploadStatus}</p>
          ) : null}
          <DialogFooter showCloseButton={!isUploading} />
        </DialogContent>
      </Dialog>

      <Dialog
        open={open === "paste"}
        onOpenChange={(next) => {
          if (!isDumpingPaste) onOpenChange(next ? "paste" : null);
        }}
      >
        <DialogContent
          className="sm:max-w-lg"
          showCloseButton={!isDumpingPaste}
        >
          <DialogHeader>
            <DialogTitle>Paste evidence</DialogTitle>
            <DialogDescription>
              Paste page text, tool output, or notes into the active Case.
            </DialogDescription>
          </DialogHeader>
          {association}
          <PasteForm
            formId={pasteFormId}
            shouldShowSubmit={false}
            disabled={isBusy}
            isLoading={isDumpingPaste}
            onSubmit={onPaste}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isDumpingPaste}
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
              loading={isDumpingPaste}
              disabled={isBusy}
            >
              Add Evidence
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={open === "url"}
        onOpenChange={(next) => {
          if (!isDumpingUrl) onOpenChange(next ? "url" : null);
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton={!isDumpingUrl}>
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
            shouldShowSubmit={false}
            shouldShowHint={false}
            disabled={isBusy}
            isLoading={isDumpingUrl}
            onSubmit={onUrl}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isDumpingUrl}
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
              loading={isDumpingUrl}
              disabled={isBusy}
            >
              Add link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

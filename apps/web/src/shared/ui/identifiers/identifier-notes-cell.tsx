import { StickyNoteIcon } from "lucide-react";
import { useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { RichTextEditor } from "@/shared/ui/rich-text";
import { Button } from "@/shared/ui/shadcn/button";
import { Separator } from "@/shared/ui/shadcn/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/shared/ui/shadcn/sheet";

function notesPresent(notes: string | null | undefined): boolean {
  return (notes ?? "").trim() !== "";
}

/** Narrow sticky-note control: opens a Markdown notes Sheet (blur/close autosave). */
export function NotesIconCell({
  id,
  notes,
  saveNotes,
  editorAriaLabel = "Notes",
}: {
  id: string;
  notes: string | null | undefined;
  saveNotes: (id: string, notes: string) => void | Promise<void>;
  editorAriaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(notes ?? "");
  const [editorKey, setEditorKey] = useState(0);
  const draftRef = useRef(notes ?? "");
  const savedRef = useRef(notes ?? "");
  const hasNotes = notesPresent(notes);
  const label = hasNotes ? "Edit notes" : "Add notes";

  async function flushIfDirty(): Promise<void> {
    const next = draftRef.current;
    if (next === savedRef.current) return;
    await saveNotes(id, next);
    savedRef.current = next;
  }

  function openSheet(): void {
    const next = notes ?? "";
    setDraft(next);
    draftRef.current = next;
    savedRef.current = next;
    setEditorKey((key) => key + 1);
    setOpen(true);
  }

  return (
    <div
      className="flex w-full items-center justify-center"
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(
          "size-6 p-0",
          hasNotes ? "text-foreground" : "text-muted-foreground"
        )}
        aria-label={label}
        title={label}
        onClick={openSheet}
      >
        <StickyNoteIcon
          className={cn("size-3.5", hasNotes && "fill-current")}
          aria-hidden
        />
      </Button>

      <Sheet
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) return;
          void (async () => {
            await flushIfDirty();
            setOpen(false);
          })();
        }}
      >
        <SheetContent
          side="right"
          className="flex flex-col gap-0 p-0 sm:max-w-2xl"
        >
          <SheetHeader className="px-5 pt-5 pb-4">
            <SheetTitle className="text-base">Notes</SheetTitle>
          </SheetHeader>
          <Separator />
          <div className="flex min-h-0 flex-1 flex-col px-5 py-4">
            <RichTextEditor
              editorKey={editorKey}
              value={draft}
              onChange={(markdown) => {
                setDraft(markdown);
                draftRef.current = markdown;
              }}
              onBlurShell={() => {
                void flushIfDirty();
              }}
              ariaLabel={editorAriaLabel}
              variant="seamless"
              toolbar="always"
              fill
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

/** Identifier-table alias for {@link NotesIconCell}. */
export function IdentifierNotesCell({
  identifierId,
  notes,
  saveNotes,
}: {
  identifierId: string;
  notes: string | null | undefined;
  saveNotes: (identifierId: string, notes: string) => void | Promise<void>;
}) {
  return (
    <NotesIconCell
      id={identifierId}
      notes={notes}
      saveNotes={saveNotes}
      editorAriaLabel="Identifier notes"
    />
  );
}

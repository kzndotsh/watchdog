import { StickyNoteIcon } from "lucide-react";
import { useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/shared/ui/primitives/button";
import { preloadRichTextEditor, RichTextEditor } from "@/shared/ui/rich-text";
import { Separator } from "@watchdog/ui/components/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@watchdog/ui/components/sheet";

function notesPresent(notes: string | null | undefined): boolean {
  return (notes ?? "").trim() !== "";
}

type NotesIconCellProps = {
  id: string;
  notes: string | null | undefined;
  /** The row's `version` as rendered; the save sends the version the sheet opened at. */
  version: number;
  /**
   * Save the notes against `expectedVersion`. A rejection keeps the sheet open (the parent
   * reports it), so a stale draft is never silently dropped or overwritten.
   */
  saveNotes: (
    id: string,
    notes: string,
    expectedVersion: number
  ) => void | Promise<void>;
  editorAriaLabel?: string;
};

/** Intent: fetch the editor chunk before the Sheet opens so it paints instantly. */
async function warmEditor(): Promise<void> {
  try {
    await preloadRichTextEditor();
  } catch {
    // Silent: opening the Sheet retries the import and surfaces the error then.
  }
}

function handlePreloadEditor(): void {
  void warmEditor();
}

/** Narrow sticky-note control: opens a Markdown notes Sheet (blur/close autosave). */
export function NotesIconCell({
  id,
  notes,
  version,
  saveNotes,
  editorAriaLabel = "Notes",
}: NotesIconCellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState(notes ?? "");
  const [editorKey, setEditorKey] = useState(0);
  const draftRef = useRef(notes ?? "");
  const savedRef = useRef(notes ?? "");
  // The version the draft was loaded at, not the row's latest: a change that lands while the
  // sheet is open must fail the save as stale rather than be overwritten. Each save is one
  // UPDATE, so it moves the draft's base on by one.
  const versionRef = useRef(version);
  const hasNotes = notesPresent(notes);
  const label = hasNotes ? "Edit notes" : "Add notes";

  async function flushIfDirty(): Promise<boolean> {
    const next = draftRef.current;
    if (next === savedRef.current) return true;
    try {
      await saveNotes(id, next, versionRef.current);
    } catch {
      // The parent reports the failure; keep the draft and the sheet for a retry.
      return false;
    }
    savedRef.current = next;
    versionRef.current += 1;
    return true;
  }

  function handleOpenSheet(): void {
    const next = notes ?? "";
    setDraft(next);
    draftRef.current = next;
    savedRef.current = next;
    versionRef.current = version;
    setEditorKey((key) => key + 1);
    setIsOpen(true);
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
        size="icon-sm"
        className={hasNotes ? "text-foreground" : "text-muted-foreground"}
        aria-label={label}
        title={label}
        onClick={handleOpenSheet}
        onPointerEnter={handlePreloadEditor}
        onFocus={handlePreloadEditor}
      >
        <StickyNoteIcon
          className={cn("size-3.5", hasNotes && "fill-current")}
          aria-hidden
        />
      </Button>

      <Sheet
        open={isOpen}
        onOpenChange={(nextOpen) => {
          if (nextOpen) return;
          void (async () => {
            if (await flushIfDirty()) setIsOpen(false);
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
              shouldFill
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

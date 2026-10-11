import { NotesIconCell } from "@/shared/ui/identifiers/notes-icon-cell";

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

import { NotesIconCell } from "@/shared/ui/identifiers/notes-icon-cell";

type IdentifierNotesCellProps = {
  identifierId: string;
  notes: string | null | undefined;
  version: number;
  saveNotes: (
    identifierId: string,
    notes: string,
    expectedVersion: number
  ) => void | Promise<void>;
};

/** Identifier-table alias for {@link NotesIconCell}. */
export function IdentifierNotesCell({
  identifierId,
  notes,
  version,
  saveNotes,
}: IdentifierNotesCellProps) {
  return (
    <NotesIconCell
      id={identifierId}
      notes={notes}
      version={version}
      saveNotes={saveNotes}
      editorAriaLabel="Identifier notes"
    />
  );
}

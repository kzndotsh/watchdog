import { DossierSection } from "@/domains/dossier/components/dossier-section";
import { useEntityProseFields } from "@/domains/dossier/hooks/use-entity-prose-fields";
import type { EntityRecord } from "@/domains/entities/types";
import { placeholderDeemphasisClass } from "@/shared/lib/placeholder-deemphasis";
import { RichTextEditor } from "@/shared/ui/rich-text";
import { FieldError } from "@watchdog/ui/components/field";

/** Spider / working notes — own tab (not Overview). */
export function NotesSection({
  caseId,
  entity,
  placeholder = false,
}: {
  caseId: string;
  entity: EntityRecord;
  placeholder?: boolean;
}) {
  const {
    notes,
    setNotes,
    error,
    setError,
    saveMutation,
    notesDirty,
    editorKey,
  } = useEntityProseFields(entity);

  function onSave() {
    if (!notesDirty) return;
    setError(null);
    saveMutation.mutate({
      caseId,
      entityId: entity.id,
      entitySlug: entity.slug,
      patch: { notes },
    });
  }

  return (
    <DossierSection
      title="Notes"
      fill
      className={placeholderDeemphasisClass(placeholder)}
      actions={
        saveMutation.isPending ? (
          <span className="text-muted-foreground text-xs">Saving…</span>
        ) : null
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <FieldError>{error}</FieldError>
        <RichTextEditor
          editorKey={editorKey}
          value={notes}
          onChange={setNotes}
          onBlurShell={onSave}
          ariaLabel="Notes"
          variant="seamless"
          fill
        />
      </div>
    </DossierSection>
  );
}

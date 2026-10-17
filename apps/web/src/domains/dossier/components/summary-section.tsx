import { DossierSection } from "@/domains/dossier/components/dossier-section";
import { useEntityProseFields } from "@/domains/dossier/hooks/use-entity-prose-fields";
import type { EntityRecord } from "@/domains/entities/types";
import { useUnsavedGuard } from "@/shared/hooks/use-unsaved-guard";
import { placeholderDeemphasisClass } from "@/shared/lib/placeholder-deemphasis";
import { RichTextEditor } from "@/shared/ui/rich-text";
import { UnsavedChangesDialog } from "@/shared/ui/unsaved-changes-dialog";
import { FieldError } from "@watchdog/ui/components/field";

type SummarySectionProps = {
  caseId: string;
  entity: EntityRecord;
  isPlaceholder?: boolean;
};

/** BLUF summary — lives on Overview. */
export function SummarySection({
  caseId,
  entity,
  isPlaceholder = false,
}: SummarySectionProps) {
  const {
    summary,
    setSummary,
    error,
    setError,
    saveMutation,
    summaryDirty,
    editorKey,
  } = useEntityProseFields(entity);

  // A save in flight is not unsaved: the write is already on its way.
  const guard = useUnsavedGuard(summaryDirty && !saveMutation.isPending);

  function handleSave() {
    if (!summaryDirty) return;
    setError(null);
    saveMutation.mutate({
      caseId,
      entityId: entity.id,
      entitySlug: entity.slug,
      patch: { summary },
    });
  }

  return (
    <DossierSection
      title="Summary"
      className={placeholderDeemphasisClass(isPlaceholder)}
      actions={
        saveMutation.isPending ? (
          <span className="text-muted-foreground text-xs">Saving…</span>
        ) : null
      }
    >
      <FieldError>{error}</FieldError>
      <RichTextEditor
        editorKey={editorKey}
        value={summary}
        onChange={setSummary}
        onBlurShell={handleSave}
        ariaLabel="Summary"
        variant="seamless"
      />
      <UnsavedChangesDialog guard={guard} subject="your summary" />
    </DossierSection>
  );
}

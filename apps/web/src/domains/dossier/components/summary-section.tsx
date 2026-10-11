import { DossierSection } from "@/domains/dossier/components/dossier-section";
import { useEntityProseFields } from "@/domains/dossier/hooks/use-entity-prose-fields";
import type { EntityRecord } from "@/domains/entities/types";
import { placeholderDeemphasisClass } from "@/shared/lib/placeholder-deemphasis";
import { RichTextEditor } from "@/shared/ui/rich-text";
import { FieldError } from "@watchdog/ui/components/field";

type SummarySectionProps = {
  caseId: string;
  entity: EntityRecord;
  placeholder?: boolean;
};

/** BLUF summary — lives on Overview. */
export function SummarySection({
  caseId,
  entity,
  placeholder = false,
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

  function onSave() {
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
      className={placeholderDeemphasisClass(placeholder)}
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
        onBlurShell={onSave}
        ariaLabel="Summary"
        variant="seamless"
      />
    </DossierSection>
  );
}

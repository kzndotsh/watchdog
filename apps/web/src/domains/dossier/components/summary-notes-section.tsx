import { useState } from "react";

import { DossierSection } from "@/domains/dossier/components/dossier-section";
import { useSaveEntityProse } from "@/domains/dossier/hooks/use-save-entity-prose";
import type { EntityRecord } from "@/domains/entities/types";
import { placeholderDeemphasisClass } from "@/shared/lib/placeholder-deemphasis";
import { RichTextEditor } from "@/shared/ui/rich-text";
import { FieldError } from "@watchdog/ui/components/field";

/**
 * Local draft of entity prose (Markdown). Remount owner with `key={entity.id}`
 * on identity change — draft seeds once and never re-syncs from props.
 */
function useEntityProseFields(entity: EntityRecord) {
  const [summary, setSummary] = useState(entity.summary ?? "");
  const [notes, setNotes] = useState(entity.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const saveMutation = useSaveEntityProse({ onError: setError });

  return {
    summary,
    setSummary,
    notes,
    setNotes,
    error,
    setError,
    saveMutation,
    summaryDirty: summary.trim() !== (entity.summary ?? "").trim(),
    notesDirty: notes.trim() !== (entity.notes ?? "").trim(),
    editorKey: `${entity.id}:${entity.updatedAt}`,
  };
}

/** BLUF summary — lives on Overview. */
export function SummarySection({
  caseId,
  entity,
  placeholder = false,
}: {
  caseId: string;
  entity: EntityRecord;
  placeholder?: boolean;
}) {
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

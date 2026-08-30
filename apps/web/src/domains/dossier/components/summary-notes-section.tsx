import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { DossierSection } from "@/domains/dossier/components/dossier-section";
import { updateEntityFieldsFn } from "@/domains/entities/entities.functions";
import { entitiesKeys } from "@/domains/entities/queries";
import type { EntityRecord } from "@/domains/entities/types";
import { errMessage } from "@/lib/utils";
import { invalidateAfterEntityChanged } from "@/shared/lib/query-invalidation";
import { FormInlineError } from "@/shared/ui/form-inline-message";
import { RichTextEditor } from "@/shared/ui/rich-text";

/**
 * Local draft of entity prose (Markdown). Remount owner with `key={entity.id}`
 * on identity change — draft seeds once and never re-syncs from props.
 */
function useEntityProseFields(caseId: string, entity: EntityRecord) {
  const queryClient = useQueryClient();
  const [summary, setSummary] = useState(entity.summary ?? "");
  const [notes, setNotes] = useState(entity.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (patch: { summary?: string; notes?: string }) =>
      updateEntityFieldsFn({
        data: {
          caseId,
          entityId: entity.id,
          summary: patch.summary ?? summary,
          notes: patch.notes ?? notes,
        },
      }),
    onSuccess: async (next) => {
      queryClient.setQueryData(entitiesKeys.detail(caseId, entity.slug), next);
      await invalidateAfterEntityChanged(queryClient, caseId, {
        entityId: entity.id,
        slug: entity.slug,
      });
    },
    onError: (e) => {
      setError(errMessage(e, "Save failed"));
    },
  });

  return {
    summary,
    setSummary,
    notes,
    setNotes,
    error,
    setError,
    saveMutation,
    summaryDirty: summary !== (entity.summary ?? ""),
    notesDirty: notes !== (entity.notes ?? ""),
    editorKey: `${entity.id}:${entity.updatedAt}`,
  };
}

/** BLUF summary — lives on Overview. */
export function SummarySection({
  caseId,
  entity,
}: {
  caseId: string;
  entity: EntityRecord;
}) {
  const {
    summary,
    setSummary,
    notes,
    error,
    setError,
    saveMutation,
    summaryDirty,
    editorKey,
  } = useEntityProseFields(caseId, entity);

  function onSave() {
    if (!summaryDirty) return;
    setError(null);
    saveMutation.mutate({ summary, notes });
  }

  return (
    <DossierSection
      title="Summary"
      actions={
        saveMutation.isPending ? (
          <span className="text-muted-foreground text-xs">Saving…</span>
        ) : null
      }
    >
      <FormInlineError>{error}</FormInlineError>
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
}: {
  caseId: string;
  entity: EntityRecord;
}) {
  const {
    summary,
    notes,
    setNotes,
    error,
    setError,
    saveMutation,
    notesDirty,
    editorKey,
  } = useEntityProseFields(caseId, entity);

  function onSave() {
    if (!notesDirty) return;
    setError(null);
    saveMutation.mutate({ summary, notes });
  }

  return (
    <DossierSection
      title="Notes"
      fill
      actions={
        saveMutation.isPending ? (
          <span className="text-muted-foreground text-xs">Saving…</span>
        ) : null
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <FormInlineError>{error}</FormInlineError>
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

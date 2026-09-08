import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { DossierSection } from "@/domains/dossier/components/dossier-section";
import { entitiesKeys } from "@/domains/entities/entities-keys";
import { updateEntityFieldsFn } from "@/domains/entities/entities.functions";
import { buildUpdateEntityFieldsData } from "@/domains/entities/lib/entity-write";
import type { EntityRecord } from "@/domains/entities/types";
import { errMessage } from "@/lib/utils";
import { placeholderDeemphasisClass } from "@/shared/lib/placeholder-deemphasis";
import { scopeCaseSlug } from "@/shared/lib/query-ingress";
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
    mutationFn: async (patch: {
      summary?: string | null;
      notes?: string | null;
    }) =>
      updateEntityFieldsFn({
        data: buildUpdateEntityFieldsData(caseId, {
          entityId: entity.id,
          ...patch,
        }),
      }),
    onSuccess: async (next) => {
      const { scoped } = scopeCaseSlug(caseId, entity.slug);
      queryClient.setQueryData(
        entitiesKeys.detail(scoped.caseId, scoped.slug),
        next
      );
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
  } = useEntityProseFields(caseId, entity);

  function onSave() {
    if (!summaryDirty) return;
    setError(null);
    saveMutation.mutate({ summary });
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
  } = useEntityProseFields(caseId, entity);

  function onSave() {
    if (!notesDirty) return;
    setError(null);
    saveMutation.mutate({ notes });
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

import { useState } from "react";

import { useSaveEntityProse } from "@/domains/dossier/hooks/use-save-entity-prose";
import type { EntityRecord } from "@/domains/entities/types";

/**
 * Local draft of entity prose (Markdown). Remount owner with `key={entity.id}`
 * on identity change — draft seeds once and never re-syncs from props.
 */
export function useEntityProseFields(entity: EntityRecord) {
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

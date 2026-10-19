import { useRef, useState } from "react";

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
  // The version the draft was seeded from. The owner remounts when the Entity changes (its `key`
  // carries `updatedAt`), so this is what a save must find still current on the server.
  const loadedVersionRef = useRef(entity.version);

  const saveMutation = useSaveEntityProse({ onError: setError });

  return {
    summary,
    setSummary,
    notes,
    setNotes,
    error,
    setError,
    loadedVersionRef,
    saveMutation,
    summaryDirty: summary.trim() !== (entity.summary ?? "").trim(),
    notesDirty: notes.trim() !== (entity.notes ?? "").trim(),
    editorKey: `${entity.id}:${entity.updatedAt}`,
  };
}

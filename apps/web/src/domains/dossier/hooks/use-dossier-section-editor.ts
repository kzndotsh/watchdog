import { useCallback, useState } from "react";

export function useDossierSectionEditor(opts?: { onResetCreate?: () => void }) {
  const onResetCreate = opts?.onResetCreate;
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [edit, setEdit] = useState<{ id: string; version: number } | null>(
    null
  );

  const handleStartAdding = useCallback(() => {
    setEdit(null);
    setIsAdding(true);
  }, []);

  const handleStopAdding = useCallback(() => {
    onResetCreate?.();
    setIsAdding(false);
  }, [onResetCreate]);

  const handleToggleAdding = useCallback(() => {
    if (isAdding) {
      handleStopAdding();
      return;
    }
    handleStartAdding();
  }, [isAdding, handleStartAdding, handleStopAdding]);

  const handleOpenEdit = useCallback(
    (id: string, version: number) => {
      onResetCreate?.();
      setIsAdding(false);
      setEdit({ id, version });
    },
    [onResetCreate]
  );

  const handleCloseEdit = useCallback(() => {
    setEdit(null);
  }, []);

  const handleError = useCallback((message: string | null) => {
    setError(message);
  }, []);

  const isEmpty = useCallback(
    (rowCount: number) => rowCount === 0 && !isAdding,
    [isAdding]
  );

  return {
    error,
    isAdding,
    editId: edit?.id ?? null,
    /**
     * The row's `version` when its editor opened, not when the list last refetched: a save sends
     * it as `expectedVersion`, so a change that landed while the form was open is a conflict.
     */
    editVersion: edit?.version ?? null,
    handleStartAdding,
    handleStopAdding,
    handleToggleAdding,
    handleOpenEdit,
    handleCloseEdit,
    handleError,
    isEmpty,
  };
}

export type DossierSectionEditor = ReturnType<typeof useDossierSectionEditor>;

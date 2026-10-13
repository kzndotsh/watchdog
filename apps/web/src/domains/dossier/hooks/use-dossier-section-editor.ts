import { useCallback, useState } from "react";

export function useDossierSectionEditor(opts?: { onResetCreate?: () => void }) {
  const onResetCreate = opts?.onResetCreate;
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const handleStartAdding = useCallback(() => {
    setEditId(null);
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
    (id: string) => {
      onResetCreate?.();
      setIsAdding(false);
      setEditId(id);
    },
    [onResetCreate]
  );

  const handleCloseEdit = useCallback(() => {
    setEditId(null);
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
    editId,
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

import type { QueryClient } from "@tanstack/react-query";

import { couldnt, errMessage } from "@/lib/utils";
import { invalidateAfterCredentialMutation } from "@/shared/lib/query-invalidation";
import { toast } from "@/shared/ui/toast";

export function handleCredentialDeleteError(
  error: unknown,
  setDeleteError: (message: string | null) => void
): void {
  setDeleteError(errMessage(error, couldnt("delete", "credential")));
}

export function openConfigureCredential(
  name: string,
  setError: (message: string | null) => void,
  setConfigureName: (name: string | null) => void
): void {
  setError(null);
  setConfigureName(name);
}

export function openDeleteCredential(
  name: string,
  setDeleteError: (message: string | null) => void,
  setDeleteTarget: (name: string | null) => void
): void {
  setDeleteError(null);
  setDeleteTarget(name);
}

export async function handleCredentialSaved(
  queryClient: QueryClient,
  setError: (message: string | null) => void
): Promise<void> {
  setError(null);
  toast.success("Credential saved");
  await invalidateAfterCredentialMutation(queryClient);
}

export function handleDeleteConfirm(
  deleteTarget: string | null,
  mutate: (name: string) => void
): void {
  if (deleteTarget) mutate(deleteTarget);
}

export function closeConfigureDialog(
  isOpen: boolean,
  setConfigureName: (name: string | null) => void
): void {
  if (!isOpen) setConfigureName(null);
}

export function closeDeleteDialog(
  isOpen: boolean,
  isPending: boolean,
  setDeleteTarget: (name: string | null) => void,
  setDeleteError: (message: string | null) => void
): void {
  if (!isOpen && !isPending) {
    setDeleteTarget(null);
    setDeleteError(null);
  }
}

/** Module-level binders — avoid nested closures inside the form component. */
export function bindConfigureSlot(
  setError: (message: string | null) => void,
  setConfigureName: (name: string | null) => void
): (name: string) => void {
  return (name) => {
    openConfigureCredential(name, setError, setConfigureName);
  };
}

export function bindDeleteSlot(
  setDeleteError: (message: string | null) => void,
  setDeleteTarget: (name: string | null) => void
): (name: string) => void {
  return (name) => {
    openDeleteCredential(name, setDeleteError, setDeleteTarget);
  };
}

export function bindConfigureOpenChange(
  setConfigureName: (name: string | null) => void
): (open: boolean) => void {
  return (open) => {
    closeConfigureDialog(open, setConfigureName);
  };
}

export function bindCredentialSaved(
  queryClient: QueryClient,
  setError: (message: string | null) => void
): () => void {
  return () => {
    void handleCredentialSaved(queryClient, setError);
  };
}

export function bindDeleteOpenChange(
  isPending: boolean,
  setDeleteTarget: (name: string | null) => void,
  setDeleteError: (message: string | null) => void
): (open: boolean) => void {
  return (open) => {
    closeDeleteDialog(open, isPending, setDeleteTarget, setDeleteError);
  };
}

export function bindDeleteConfirm(
  deleteTarget: string | null,
  mutate: (name: string) => void
): () => void {
  return () => {
    handleDeleteConfirm(deleteTarget, mutate);
  };
}

export function bindCredentialDeleted(
  setDeleteTarget: (name: string | null) => void
): () => void {
  return () => {
    setDeleteTarget(null);
  };
}

export function bindCredentialDeleteFailed(
  setDeleteError: (message: string | null) => void
): (error: unknown) => void {
  return (error) => {
    handleCredentialDeleteError(error, setDeleteError);
  };
}

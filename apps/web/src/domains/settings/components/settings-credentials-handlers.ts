import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { errMessage } from "@/lib/utils";
import { invalidateAfterCredentialMutation } from "@/shared/lib/query-invalidation";

export async function handleCredentialDeleted(
  queryClient: QueryClient,
  setDeleteTarget: (name: string | null) => void
): Promise<void> {
  toast.success("Credential removed");
  setDeleteTarget(null);
  await invalidateAfterCredentialMutation(queryClient);
}

export function handleCredentialDeleteError(
  error: unknown,
  setDeleteError: (message: string | null) => void
): void {
  setDeleteError(errMessage(error, "Delete failed"));
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

export function handleCredentialSaved(
  queryClient: QueryClient,
  setError: (message: string | null) => void
): void {
  setError(null);
  toast.success("Credential saved");
  void invalidateAfterCredentialMutation(queryClient);
}

export function handleDeleteConfirm(
  deleteTarget: string | null,
  mutate: (name: string) => void
): void {
  if (deleteTarget) mutate(deleteTarget);
}

export function closeConfigureDialog(
  open: boolean,
  setConfigureName: (name: string | null) => void
): void {
  if (!open) setConfigureName(null);
}

export function closeDeleteDialog(
  open: boolean,
  pending: boolean,
  setDeleteTarget: (name: string | null) => void,
  setDeleteError: (message: string | null) => void
): void {
  if (!open && !pending) {
    setDeleteTarget(null);
    setDeleteError(null);
  }
}

import { KeyRoundIcon } from "lucide-react";

import { ConfigureCredentialDialog } from "@/domains/settings/components/settings-configure-credential-dialog";
import { DestructiveConfirmDialog } from "@/shared/ui/destructive-confirm-dialog";
import type { CredentialSlot } from "@watchdog/core/vault";

type SettingsCredentialsDialogsProps = {
  configureSlot: CredentialSlot | null;
  isConfigureOpen: boolean;
  onConfigureOpenChange: (open: boolean) => void;
  onCredentialSaved: () => void;
  isDeleteOpen: boolean;
  isDeletePending: boolean;
  deleteSlot: CredentialSlot | null;
  deleteError: string | null;
  onDeleteOpenChange: (open: boolean) => void;
  onDeleteConfirm: () => void;
};

export function SettingsCredentialsDialogs({
  configureSlot,
  isConfigureOpen,
  onConfigureOpenChange,
  onCredentialSaved,
  isDeleteOpen,
  isDeletePending,
  deleteSlot,
  deleteError,
  onDeleteOpenChange,
  onDeleteConfirm,
}: SettingsCredentialsDialogsProps) {
  return (
    <>
      <ConfigureCredentialDialog
        key={configureSlot?.name ?? "closed"}
        slot={configureSlot}
        open={isConfigureOpen}
        onOpenChange={onConfigureOpenChange}
        onSaved={onCredentialSaved}
      />

      <DestructiveConfirmDialog
        open={isDeleteOpen}
        onOpenChange={onDeleteOpenChange}
        title="Remove credential"
        description={
          deleteSlot
            ? `Remove the stored secret for ${deleteSlot.label}. Anything that needs it will fail until you reconnect.`
            : undefined
        }
        confirmLabel="Remove credential"
        verificationPhrase={deleteSlot?.name ?? ""}
        verificationLabel="Type the credential name"
        irreversibility="Removing this credential cannot be undone."
        media={<KeyRoundIcon />}
        isLoading={isDeletePending}
        error={deleteError}
        onConfirm={onDeleteConfirm}
      />
    </>
  );
}

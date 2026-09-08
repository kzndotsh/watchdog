import { KeyRoundIcon } from "lucide-react";

import { ConfigureCredentialDialog } from "@/domains/settings/components/settings-configure-credential-dialog";
import { DestructiveConfirmDialog } from "@/shared/ui/destructive-confirm-dialog";
import type { CredentialSlot } from "@watchdog/core";

export function SettingsCredentialsDialogs({
  configureSlot,
  configureOpen,
  onConfigureOpenChange,
  onCredentialSaved,
  deleteOpen,
  deletePending,
  deleteSlot,
  deleteError,
  onDeleteOpenChange,
  onDeleteConfirm,
}: {
  configureSlot: CredentialSlot | null;
  configureOpen: boolean;
  onConfigureOpenChange: (open: boolean) => void;
  onCredentialSaved: () => void;
  deleteOpen: boolean;
  deletePending: boolean;
  deleteSlot: CredentialSlot | null;
  deleteError: string | null;
  onDeleteOpenChange: (open: boolean) => void;
  onDeleteConfirm: () => void;
}) {
  return (
    <>
      <ConfigureCredentialDialog
        key={configureSlot?.name ?? "closed"}
        slot={configureSlot}
        open={configureOpen}
        onOpenChange={onConfigureOpenChange}
        onSaved={onCredentialSaved}
      />

      <DestructiveConfirmDialog
        open={deleteOpen}
        onOpenChange={onDeleteOpenChange}
        title="Remove credential"
        description={
          deleteSlot
            ? `Remove the stored secret for ${deleteSlot.label}. Caps that need it will fail until you reconnect.`
            : undefined
        }
        confirmLabel="Remove credential"
        verificationPhrase={deleteSlot?.name ?? ""}
        verificationLabel="Type the credential name"
        irreversibility="Removing this credential cannot be undone."
        media={<KeyRoundIcon />}
        loading={deletePending}
        error={deleteError}
        onConfirm={onDeleteConfirm}
      />
    </>
  );
}

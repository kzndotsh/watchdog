import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { KeyRoundIcon } from "lucide-react";
import { useState } from "react";

import { SettingsCredentialsDialogs } from "@/domains/settings/components/settings-credentials-dialogs";
import {
  closeConfigureDialog,
  closeDeleteDialog,
  handleCredentialDeleted,
  handleCredentialDeleteError,
  handleCredentialSaved,
  handleDeleteConfirm,
  openConfigureCredential,
  openDeleteCredential,
} from "@/domains/settings/components/settings-credentials-handlers";
import { credentialsListQuery } from "@/domains/settings/queries";
import { deleteCredentialFn } from "@/domains/settings/settings.functions";
import { cn } from "@/lib/utils";
import { ACCENT_CARD_SURFACE } from "@/shared/ui/form-section";
import { LocalDateTime } from "@/shared/ui/local-date-time";
import { Alert, AlertDescription } from "@/shared/ui/shadcn/alert";
import { Button } from "@/shared/ui/shadcn/button";
import { Card, CardContent } from "@/shared/ui/shadcn/card";
import { Separator } from "@/shared/ui/shadcn/separator";
import { StatusDot } from "@/shared/ui/status-dot";
import type { CredentialSlot } from "@watchdog/core";

function CredentialSlotRow({
  slot,
  onConfigure,
  onDelete,
}: {
  slot: CredentialSlot;
  onConfigure: (name: string) => void;
  onDelete: (name: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <StatusDot
        status={slot.configured ? "succeeded" : "queued"}
        tooltip={false}
        className="mt-0.5"
      />

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm leading-tight font-medium">
          {slot.label}
        </span>
        {slot.updatedAt ? (
          <p className="text-muted-foreground text-xs leading-snug">
            Updated <LocalDateTime value={slot.updatedAt} />
          </p>
        ) : null}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            onConfigure(slot.name);
          }}
        >
          {slot.configured ? "Update" : "Connect"}
        </Button>
        {slot.configured ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              onDelete(slot.name);
            }}
          >
            Remove
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function CredentialSlotGroup({
  title,
  slots,
  onConfigure,
  onDelete,
}: {
  title: string;
  slots: CredentialSlot[];
  onConfigure: (name: string) => void;
  onDelete: (name: string) => void;
}) {
  if (slots.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {title}
      </h3>
      <Card className={cn(ACCENT_CARD_SURFACE, "gap-0 p-0 py-0")}>
        <CardContent className="p-0">
          {slots.map((slot, index) => (
            <div key={slot.name}>
              {index > 0 ? <Separator /> : null}
              <CredentialSlotRow
                slot={slot}
                onConfigure={onConfigure}
                onDelete={onDelete}
              />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function partitionCredentialSlots(slots: CredentialSlot[]): {
  connected: CredentialSlot[];
  disconnected: CredentialSlot[];
} {
  const connected: CredentialSlot[] = [];
  const disconnected: CredentialSlot[] = [];
  for (const slot of slots) {
    if (slot.configured) connected.push(slot);
    else disconnected.push(slot);
  }
  return { connected, disconnected };
}

function findSlotByName(
  slots: CredentialSlot[],
  name: string | null
): CredentialSlot | null {
  if (name === null) return null;
  for (const slot of slots) {
    if (slot.name === name) return slot;
  }
  return null;
}

export function SettingsCredentialsForm() {
  const queryClient = useQueryClient();
  const { data: slots } = useSuspenseQuery(credentialsListQuery());

  const [error, setError] = useState<string | null>(null);
  const [configureName, setConfigureName] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: async (name: string) => deleteCredentialFn({ data: { name } }),
    onSuccess: () => void handleCredentialDeleted(queryClient, setDeleteTarget),
    onError: (e) => {
      handleCredentialDeleteError(e, setDeleteError);
    },
  });

  const configureSlotRow = findSlotByName(slots, configureName);
  const deleteSlotRow = findSlotByName(slots, deleteTarget);
  const { connected, disconnected } = partitionCredentialSlots(slots);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {slots.length === 0 ? (
        <Card className={cn(ACCENT_CARD_SURFACE, "gap-0 p-0 py-0")}>
          <CardContent className="text-muted-foreground flex flex-col items-center gap-2 px-4 py-10 text-center text-sm">
            <KeyRoundIcon className="size-5" />
            No Cap credential slots registered.
          </CardContent>
        </Card>
      ) : (
        <>
          <CredentialSlotGroup
            title="Connected"
            slots={connected}
            onConfigure={(name) => {
              openConfigureCredential(name, setError, setConfigureName);
            }}
            onDelete={(name) => {
              openDeleteCredential(name, setDeleteError, setDeleteTarget);
            }}
          />
          <CredentialSlotGroup
            title="Not connected"
            slots={disconnected}
            onConfigure={(name) => {
              openConfigureCredential(name, setError, setConfigureName);
            }}
            onDelete={(name) => {
              openDeleteCredential(name, setDeleteError, setDeleteTarget);
            }}
          />
        </>
      )}

      <SettingsCredentialsDialogs
        configureSlot={configureSlotRow}
        configureOpen={configureName !== null}
        onConfigureOpenChange={(open) => {
          closeConfigureDialog(open, setConfigureName);
        }}
        onCredentialSaved={() => {
          handleCredentialSaved(queryClient, setError);
        }}
        onCredentialError={setError}
        deleteOpen={deleteTarget !== null}
        deletePending={deleteMutation.isPending}
        deleteSlot={deleteSlotRow}
        deleteError={deleteError}
        onDeleteOpenChange={(open) => {
          closeDeleteDialog(
            open,
            deleteMutation.isPending,
            setDeleteTarget,
            setDeleteError
          );
        }}
        onDeleteConfirm={() => {
          handleDeleteConfirm(deleteTarget, deleteMutation.mutate);
        }}
      />
    </div>
  );
}

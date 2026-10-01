import { useAuth, useAuthPlugin, useSession } from "@better-auth-ui/react";
import { useCreateApiKey } from "@better-auth-ui/react/plugins/api-key";
import { Key } from "lucide-react";
import { type SyntheticEvent, useState } from "react";

import { authClient as appAuthClient } from "@/auth/client";
import { apiKeyPlugin } from "@/auth/plugins/api-key";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/shared/ui/primitives/alert-dialog";
import { Button } from "@/shared/ui/primitives/button";
import { Field, FieldError } from "@watchdog/ui/components/field";
import { Input } from "@watchdog/ui/components/input";
import { Label } from "@watchdog/ui/components/label";
import { Spinner } from "@watchdog/ui/components/spinner";

import { formString } from "../form-data";
import { NewApiKeyDialog } from "./new-api-key-dialog";

export interface CreateApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Create an organization-owned key by passing the organization id. */
  organizationId?: string;
}

export function CreateApiKeyDialog({
  open,
  onOpenChange,
  organizationId,
}: CreateApiKeyDialogProps) {
  const { localization } = useAuth();
  const { data: sessionData, isPending: sessionPending } =
    useSession(appAuthClient);
  // Keys act in the organization they were created in (checked again on every request).
  const scopedOrganizationId =
    sessionData?.session.activeOrganizationId ?? undefined;
  const { localization: apiKeyLocalization } = useAuthPlugin(apiKeyPlugin);

  const { mutate: createApiKey, isPending: isCreating } =
    useCreateApiKey(appAuthClient);

  const [isNewKeyDialogOpen, setIsNewKeyDialogOpen] = useState(false);
  const [keyName, setKeyName] = useState<string | null>(null);
  const [secretKey, setSecretKey] = useState<string | null>(null);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setKeyName(null);
      setSecretKey(null);
    }

    onOpenChange(nextOpen);
  };

  const handleSubmit = (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();

    const formData = new FormData(e.currentTarget);
    const name = formString(formData, "name").trim();

    // Without an active organization the server uses the owner's oldest one anyway.
    const keyOrganizationId = organizationId ?? scopedOrganizationId;

    const payload = {
      ...(name ? { name } : {}),
      ...(organizationId ? { organizationId, configId: "organization" } : {}),
      ...(keyOrganizationId
        ? { metadata: { organizationId: keyOrganizationId } }
        : {}),
    };

    createApiKey(payload, {
      onSuccess: (result) => {
        handleOpenChange(false);
        setKeyName(name);
        setSecretKey(result.key);
        setIsNewKeyDialogOpen(true);
      },
    });
  };

  return (
    <>
      <AlertDialog open={open} onOpenChange={handleOpenChange}>
        <AlertDialogContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <AlertDialogHeader>
              <AlertDialogMedia>
                <Key />
              </AlertDialogMedia>

              <AlertDialogTitle>
                {apiKeyLocalization.createApiKey}
              </AlertDialogTitle>

              <AlertDialogDescription>
                {apiKeyLocalization.apiKeysDescription}
              </AlertDialogDescription>
            </AlertDialogHeader>

            <Field>
              <Label htmlFor="api-key-name">{apiKeyLocalization.name}</Label>

              <Input
                id="api-key-name"
                name="name"
                autoFocus
                placeholder={localization.settings.optional}
                disabled={isCreating}
              />

              <FieldError />
            </Field>

            <AlertDialogFooter>
              <AlertDialogCancel disabled={isCreating}>
                {localization.settings.cancel}
              </AlertDialogCancel>

              <Button type="submit" disabled={isCreating || sessionPending}>
                {isCreating && <Spinner />}

                {apiKeyLocalization.createApiKey}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>

      <NewApiKeyDialog
        open={isNewKeyDialogOpen}
        onOpenChange={setIsNewKeyDialogOpen}
        secretKey={secretKey}
        name={keyName}
      />
    </>
  );
}

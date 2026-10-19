import { useAuth, useAuthPlugin, useSession } from "@better-auth-ui/react";
import { Key } from "lucide-react";
import { type SyntheticEvent, useState } from "react";

import { authClient as appAuthClient } from "@/auth/client";
import { apiKeyPlugin } from "@/auth/plugins/api-key";
import { couldnt, errMessage } from "@/lib/utils";
import { useCreateApiKey } from "@/shared/hooks/use-create-api-key";
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
import { SCOPE_PRESETS, type Scope } from "@watchdog/schemas/shared";
import { Field, FieldError } from "@watchdog/ui/components/field";
import { Input } from "@watchdog/ui/components/input";
import { Label } from "@watchdog/ui/components/label";
import { Spinner } from "@watchdog/ui/components/spinner";

import { formString } from "../form-data";
import { NewApiKeyDialog } from "./new-api-key-dialog";
import { ScopePicker } from "./scope-picker";

const DEFAULT_SCOPES: Scope[] = [...SCOPE_PRESETS.agent];

export interface CreateApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Create a key with the chosen scopes. The server function sets the scopes and the
 * organization (the session's active one); Better Auth's browser create endpoint is closed.
 */
export function CreateApiKeyDialog({
  open,
  onOpenChange,
}: CreateApiKeyDialogProps) {
  const { localization } = useAuth();
  const { data: sessionData, isPending: sessionPending } =
    useSession(appAuthClient);
  const { localization: apiKeyLocalization } = useAuthPlugin(apiKeyPlugin);
  const { mutate: createApiKey, isPending: isCreating } = useCreateApiKey(
    sessionData?.user.id
  );

  const [isNewKeyDialogOpen, setIsNewKeyDialogOpen] = useState(false);
  const [keyName, setKeyName] = useState<string | null>(null);
  const [secretKey, setSecretKey] = useState<string | null>(null);
  const [scopes, setScopes] = useState<Scope[]>(DEFAULT_SCOPES);
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setKeyName(null);
      setSecretKey(null);
      setScopes(DEFAULT_SCOPES);
      setError(null);
    }

    onOpenChange(nextOpen);
  };

  const handleSubmit = (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();

    const formData = new FormData(e.currentTarget);
    const name = formString(formData, "name").trim();
    setError(null);

    createApiKey(
      { ...(name ? { name } : {}), scopes },
      {
        onSuccess: (result) => {
          setKeyName(name);
          setSecretKey(result.key);
          setScopes(DEFAULT_SCOPES);
          setError(null);
          onOpenChange(false);
          setIsNewKeyDialogOpen(true);
        },
        onError: (err) => {
          setError(errMessage(err, couldnt("create", "API key")));
        },
      }
    );
  };

  return (
    <>
      <AlertDialog open={open} onOpenChange={handleOpenChange}>
        <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
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
                maxLength={32}
                disabled={isCreating}
              />
            </Field>

            <ScopePicker
              value={scopes}
              onChange={setScopes}
              disabled={isCreating}
            />

            {error !== null && <FieldError>{error}</FieldError>}

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

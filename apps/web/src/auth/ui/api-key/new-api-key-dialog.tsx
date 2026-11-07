"use client";

import { useAuth, useAuthPlugin } from "@better-auth-ui/react";
import { Check, Copy, Key } from "lucide-react";

import { apiKeyPlugin } from "@/auth/plugins/api-key";
import { couldnt, errMessage, firstNonEmpty } from "@/lib/utils";
import { useCopyText } from "@/shared/hooks/use-copy-text";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/shared/ui/primitives/alert-dialog";
import {
  InputGroup,
  InputGroupButton,
  InputGroupInput,
} from "@watchdog/ui/components/input-group";
import { Label } from "@watchdog/ui/components/label";

export interface NewApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string | null;
  secretKey: string | null;
}

export function NewApiKeyDialog({
  open,
  onOpenChange,
  name,
  secretKey,
}: NewApiKeyDialogProps) {
  const { localization } = useAuth();
  const { localization: apiKeyLocalization } = useAuthPlugin(apiKeyPlugin);

  const { copy, isCopied } = useCopyText({
    failure: (error) => errMessage(error, couldnt("copy", "API key")),
  });
  const copySecretKey = async () => {
    if (!secretKey) return;
    await copy(secretKey);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <Key />
          </AlertDialogMedia>

          <AlertDialogTitle>{apiKeyLocalization.newApiKey}</AlertDialogTitle>

          <AlertDialogDescription>
            {apiKeyLocalization.newApiKeyWarning}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-2">
          <Label htmlFor="new-api-key-secret">
            {firstNonEmpty(name) ?? apiKeyLocalization.apiKey}
          </Label>

          <InputGroup>
            <InputGroupInput
              id="new-api-key-secret"
              value={secretKey ?? ""}
              readOnly
              className="font-mono text-xs"
            />

            <InputGroupButton
              size="icon-xs"
              aria-label={localization.settings.copyToClipboard}
              onClick={() => {
                void copySecretKey();
              }}
            >
              {isCopied ? <Check /> : <Copy />}
            </InputGroupButton>
          </InputGroup>
        </div>

        <AlertDialogFooter>
          <AlertDialogAction
            onClick={() => {
              onOpenChange(false);
            }}
          >
            {apiKeyLocalization.dismissNewKey}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

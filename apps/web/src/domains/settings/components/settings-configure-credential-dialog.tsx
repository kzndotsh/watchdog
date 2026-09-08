import { useForm } from "@tanstack/react-form";
import { Eye, EyeOff, KeyRoundIcon } from "lucide-react";
import { useState, type SyntheticEvent } from "react";

import { putCredentialFn } from "@/domains/settings/settings.functions";
import { putCredentialInputSchema } from "@/domains/settings/types";
import { errMessage } from "@/lib/utils";
import { FormInlineError } from "@/shared/ui/form-inline-message";
import { LocalDateTime } from "@/shared/ui/local-date-time";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/shared/ui/shadcn/alert-dialog";
import { Button } from "@/shared/ui/shadcn/button";
import { Field, FieldLabel } from "@/shared/ui/shadcn/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/shared/ui/shadcn/input-group";
import { Spinner } from "@/shared/ui/shadcn/spinner";
import { StatusDot } from "@/shared/ui/status-dot";
import type { CredentialSlot } from "@watchdog/core";

function secretFieldValidator({ value }: { value: string }) {
  return value.trim() ? undefined : "Enter a secret before saving";
}

function resetConfigureForm(
  form: { reset: () => void },
  setSecretVisible: (visible: boolean) => void
): void {
  form.reset();
  setSecretVisible(false);
}

export function ConfigureCredentialDialog({
  slot,
  open,
  onOpenChange,
  onSaved,
}: {
  slot: CredentialSlot | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [secretVisible, setSecretVisible] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const configured = slot?.configured ?? false;

  const form = useForm({
    defaultValues: { secret: "" },
    onSubmit: async ({ value }) => {
      if (!slot) return;
      const secret = value.secret.trim();
      if (!secret) return;
      setSaveError(null);
      try {
        await putCredentialFn({
          data: putCredentialInputSchema.parse({
            name: slot.name,
            secret,
          }),
        });
        resetConfigureForm(form, setSecretVisible);
        setSaveError(null);
        onOpenChange(false);
        onSaved();
      } catch (error) {
        setSaveError(errMessage(error, "Save failed"));
      }
    },
  });

  function handleOpenChange(next: boolean) {
    if (!next) {
      resetConfigureForm(form, setSecretVisible);
      setSaveError(null);
    }
    onOpenChange(next);
  }

  function handleFormSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    void form.handleSubmit();
  }

  function handleSecretChange(value: string) {
    form.setFieldValue("secret", value);
  }

  function toggleSecretVisible() {
    setSecretVisible((visible) => !visible);
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="data-[size=default]:sm:max-w-md">
        <form className="flex flex-col gap-6" onSubmit={handleFormSubmit}>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <KeyRoundIcon />
            </AlertDialogMedia>
            <AlertDialogTitle>
              {configured
                ? `Update ${slot?.label ?? "credential"}`
                : `Connect ${slot?.label ?? "credential"}`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {slot?.description ??
                "Paste the provider secret. Caps read it at runtime from the vault."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {slot ? (
            <div className="bg-muted/40 ring-foreground/8 flex items-center gap-2.5 rounded-md px-3 py-2.5 ring-1">
              <StatusDot
                status={configured ? "succeeded" : "pending"}
                tooltip={false}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{slot.label}</p>
                <p className="text-muted-foreground text-label-mono-sm truncate">
                  {slot.name}
                </p>
              </div>
              {configured && slot.updatedAt ? (
                <p className="text-muted-foreground text-label-mono-sm shrink-0">
                  Updated <LocalDateTime value={slot.updatedAt} />
                </p>
              ) : (
                <p className="text-muted-foreground text-label-mono-sm shrink-0">
                  Not connected
                </p>
              )}
            </div>
          ) : null}

          <form.Field
            name="secret"
            validators={{ onSubmit: secretFieldValidator }}
          >
            {(field) => (
              <Field data-invalid={!!field.state.meta.errors[0]}>
                <FieldLabel htmlFor="credential-secret">
                  {configured ? "New secret" : "API key / secret"}
                </FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    id="credential-secret"
                    type={secretVisible ? "text" : "password"}
                    autoComplete="off"
                    autoFocus
                    placeholder={configured ? "••••••••" : "Paste secret…"}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => {
                      handleSecretChange(e.target.value);
                    }}
                    disabled={form.state.isSubmitting}
                    aria-invalid={!!field.state.meta.errors[0]}
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      type="button"
                      size="icon-xs"
                      aria-label={secretVisible ? "Hide secret" : "Show secret"}
                      onClick={toggleSecretVisible}
                      disabled={form.state.isSubmitting}
                    >
                      {secretVisible ? <EyeOff /> : <Eye />}
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
                <FormInlineError>{field.state.meta.errors[0]}</FormInlineError>
              </Field>
            )}
          </form.Field>

          <FormInlineError>{saveError}</FormInlineError>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={form.state.isSubmitting}>
              Cancel
            </AlertDialogCancel>
            <form.Subscribe
              selector={(state) => ({
                canSubmit: state.canSubmit,
                isSubmitting: state.isSubmitting,
                secret: state.values.secret,
              })}
            >
              {({ canSubmit, isSubmitting, secret }) => (
                <Button
                  type="submit"
                  disabled={isSubmitting || !canSubmit || !secret.trim()}
                >
                  {isSubmitting ? <Spinner /> : null}
                  {configured ? "Save secret" : "Connect"}
                </Button>
              )}
            </form.Subscribe>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

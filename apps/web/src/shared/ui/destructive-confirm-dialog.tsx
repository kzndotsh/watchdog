import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/shared/ui/shadcn/alert-dialog";
import { Button } from "@/shared/ui/shadcn/button";
import { Field, FieldLabel } from "@/shared/ui/shadcn/field";
import { Input } from "@/shared/ui/shadcn/input";

/**
 * Type-to-confirm destructive dialog. Presentational — caller owns open + onConfirm.
 * Vertical stack: title → copy → warning band → type gate → actions.
 */
export function DestructiveConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  verificationPhrase,
  verificationLabel = "Type to confirm",
  irreversibility,
  media,
  loading = false,
  error,
  onConfirm,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Title Case Verb + Noun — e.g. "Delete API key". */
  title: string;
  description?: ReactNode;
  /** Matches title 1:1 — never "OK" / "Confirm". */
  confirmLabel: string;
  /** Exact string the user must type. */
  verificationPhrase: string;
  verificationLabel?: string;
  /** Optional band: "{Doing X} cannot be undone." Omit when reversible. */
  irreversibility?: string;
  media?: ReactNode;
  loading?: boolean;
  error?: string | null;
  onConfirm: () => void;
  className?: string;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [typed, setTyped] = useState("");

  const matched = typed === verificationPhrase;
  const canConfirm = matched && !loading;

  // Clear the typed phrase whenever the dialog transitions closed, however
  // that happens (Cancel, Escape, overlay click, or the caller closing it).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) {
      setTyped("");
    }
  }

  useEffect(() => {
    if (!open) {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- consistent-return requires an explicit value alongside the cleanup-returning branch below
      return undefined;
    }
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(t);
    };
  }, [open]);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (loading) return;
        onOpenChange(next);
      }}
    >
      <AlertDialogContent className={cn("gap-3 sm:max-w-xl", className)}>
        <div className="flex flex-col gap-2.5 text-left">
          <AlertDialogTitle className="flex items-center gap-2">
            {media ? (
              <span className="bg-destructive/10 text-destructive inline-flex size-8 shrink-0 items-center justify-center rounded-md *:size-4">
                {media}
              </span>
            ) : null}
            {title}
          </AlertDialogTitle>
          {description ? (
            <AlertDialogDescription className="text-left">
              {description}
            </AlertDialogDescription>
          ) : null}
        </div>

        {irreversibility ? (
          <p className="border-destructive/25 bg-destructive/5 text-destructive rounded-md border px-3 py-2 text-xs">
            {irreversibility}
          </p>
        ) : null}

        <Field>
          <FieldLabel
            htmlFor={inputId}
            className="block w-full whitespace-normal"
          >
            {verificationLabel}{" "}
            <span className="bg-muted text-foreground rounded-md px-1.5 py-0.5 font-mono text-xs font-medium">
              {verificationPhrase}
            </span>
          </FieldLabel>
          <Input
            ref={inputRef}
            id={inputId}
            value={typed}
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            data-form-type="other"
            spellCheck={false}
            disabled={loading}
            placeholder={verificationPhrase}
            onChange={(e) => {
              setTyped(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canConfirm) {
                e.preventDefault();
                onConfirm();
              }
            }}
            aria-invalid={typed.length > 0 && !matched}
          />
        </Field>

        {error ? (
          <p className="text-destructive text-xs" role="alert">
            {error}
          </p>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            loading={loading}
            disabled={!canConfirm}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

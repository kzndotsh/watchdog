import type { ComponentProps } from "react";

import { handleDialogEnter } from "@/shared/lib/dialog-default-action";
import { Button } from "@/shared/ui/shadcn/button";
import { AlertDialogContent as BaseAlertDialogContent } from "@watchdog/ui/components/alert-dialog";

export * from "@watchdog/ui/components/alert-dialog";

/** Upstream AlertDialogContent + Enter confirms the default action (see dialog-default-action.ts). */
export function AlertDialogContent({
  enterConfirms = true,
  onKeyDown,
  ...props
}: ComponentProps<typeof BaseAlertDialogContent> & {
  enterConfirms?: boolean;
}) {
  return (
    <BaseAlertDialogContent
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (enterConfirms) handleDialogEnter(event);
      }}
      {...props}
    />
  );
}

/** Upstream AlertDialogAction rebuilt on the Watchdog Button (`loading`, extra variants). */
export function AlertDialogAction({
  className,
  ...props
}: ComponentProps<typeof Button>) {
  return (
    <Button data-slot="alert-dialog-action" className={className} {...props} />
  );
}

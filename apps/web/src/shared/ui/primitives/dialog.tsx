import type { ComponentProps } from "react";

import { handleDialogEnter } from "@/shared/lib/dialog-default-action";
import { DialogContent as BaseDialogContent } from "@watchdog/ui/components/dialog";

export * from "@watchdog/ui/components/dialog";

/** Upstream DialogContent + Enter confirms the default action (see dialog-default-action.ts). */
export function DialogContent({
  enterConfirms = true,
  onKeyDown,
  ...props
}: ComponentProps<typeof BaseDialogContent> & { enterConfirms?: boolean }) {
  return (
    <BaseDialogContent
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (enterConfirms) handleDialogEnter(event);
      }}
      {...props}
    />
  );
}

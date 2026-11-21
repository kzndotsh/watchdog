import type { ComponentProps } from "react";

import { DialogContent as BaseDialogContent } from "#ui/components/dialog";
import { handleDialogEnter } from "@/shared/lib/dialog-default-action";

export * from "#ui/components/dialog";

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

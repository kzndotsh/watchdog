import type { KeyboardEvent } from "react";

export function tableComposerKeyDown(opts: {
  isBusy: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (e: KeyboardEvent) => {
    if (e.key === "Escape" && !opts.isBusy) {
      e.preventDefault();
      opts.onCancel();
    }
    if (e.key === "Enter" && !e.shiftKey && opts.canSubmit) {
      e.preventDefault();
      opts.onSubmit();
    }
  };
}

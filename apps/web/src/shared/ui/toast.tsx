import type { ReactNode } from "react";

import { toast as toastManager, Toaster } from "@watchdog/ui/components/toast";

export { Toaster };

type ToastType = "success" | "error" | "warning" | "info" | "loading";

function show(type: ToastType, message: ReactNode) {
  return toastManager.add({ title: message, type });
}

/**
 * The upstream shadcn toast manager (`add`, `close`, `update`, `promise`, …) plus
 * one-call helpers for the common typed cases. Rendering, icons, and motion are
 * upstream's `Toaster`; mount it once in the root layout.
 */
export const toast = Object.assign(toastManager, {
  success: (message: ReactNode) => show("success", message),
  error: (message: ReactNode) => show("error", message),
  warning: (message: ReactNode) => show("warning", message),
  info: (message: ReactNode) => show("info", message),
  loading: (message: ReactNode) => show("loading", message),
});

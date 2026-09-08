import type { ReactNode } from "react";

import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";

export function DossierSectionQueryGate({
  loadError,
  pending,
  pendingFallback = null,
  onRetry,
  children,
}: {
  loadError: string | null;
  pending: boolean;
  pendingFallback?: ReactNode;
  onRetry: () => void;
  children: ReactNode;
}): ReactNode {
  if (loadError) {
    return <FetchErrorAlert error={loadError} onRetry={onRetry} />;
  }
  if (pending) {
    return pendingFallback;
  }
  return children;
}

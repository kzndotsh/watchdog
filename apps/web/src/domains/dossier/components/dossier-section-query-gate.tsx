import type { ReactNode } from "react";

import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";

type DossierSectionQueryGateProps = {
  loadError: string | null;
  pending: boolean;
  pendingFallback?: ReactNode;
  onRetry: () => void;
  children: ReactNode;
};

export function DossierSectionQueryGate({
  loadError,
  pending,
  pendingFallback = null,
  onRetry,
  children,
}: DossierSectionQueryGateProps): ReactNode {
  if (loadError) {
    return <FetchErrorAlert error={loadError} onRetry={onRetry} />;
  }
  if (pending) {
    return pendingFallback;
  }
  return children;
}

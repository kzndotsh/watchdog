import type { ReactNode } from "react";

import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";

type DossierSectionQueryGateProps = {
  loadError: string | null;
  isPending: boolean;
  pendingFallback?: ReactNode;
  onRetry: () => void;
  children: ReactNode;
};

export function DossierSectionQueryGate({
  loadError,
  isPending,
  pendingFallback = null,
  onRetry,
  children,
}: DossierSectionQueryGateProps): ReactNode {
  if (loadError) {
    return <FetchErrorAlert error={loadError} onRetry={onRetry} />;
  }
  if (isPending) {
    return pendingFallback;
  }
  return children;
}

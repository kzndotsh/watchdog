import { QueryErrorResetBoundary } from "@tanstack/react-query";
import { createContext, Suspense, useContext, type ReactNode } from "react";
import { ErrorBoundary, type FallbackProps } from "react-error-boundary";

import { cn, errMessage } from "@/lib/utils";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";

interface RegionBoundaryProps {
  fallback: ReactNode;
  children: ReactNode;
  className?: string;
}

const RegionClassNameContext = createContext<string | undefined>(undefined);

function RegionErrorFallback({
  error,
  resetErrorBoundary,
  className,
}: {
  error: unknown;
  resetErrorBoundary: () => void;
  className?: string;
}) {
  return (
    <div className={cn(className)}>
      <FetchErrorAlert
        error={errMessage(error, "Failed to load content")}
        onRetry={() => {
          resetErrorBoundary();
        }}
      />
    </div>
  );
}

function RegionErrorBoundaryFallback({
  error,
  resetErrorBoundary,
}: FallbackProps) {
  const className = useContext(RegionClassNameContext);
  return (
    <RegionErrorFallback
      error={error}
      resetErrorBoundary={resetErrorBoundary}
      className={className}
    />
  );
}

/**
 * Suspense + scoped Query error reset for one data region.
 * QueryErrorResetBoundary (component form) keeps retry scoped to this region.
 */
export function RegionBoundary({
  fallback,
  children,
  className,
}: RegionBoundaryProps) {
  return (
    <RegionClassNameContext.Provider value={className}>
      <QueryErrorResetBoundary>
        {({ reset }) => (
          <ErrorBoundary
            onReset={reset}
            FallbackComponent={RegionErrorBoundaryFallback}
          >
            <Suspense fallback={fallback}>{children}</Suspense>
          </ErrorBoundary>
        )}
      </QueryErrorResetBoundary>
    </RegionClassNameContext.Provider>
  );
}

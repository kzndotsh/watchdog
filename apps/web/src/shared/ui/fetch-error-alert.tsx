import { Button } from "@/shared/ui/primitives/button";
import { Alert, AlertDescription } from "@watchdog/ui/components/alert";

/** Dismissible fetch error banner. Shows nothing when error is null. */
export function FetchErrorAlert({
  error,
  onRetry,
}: {
  error: string | null;
  onRetry?: () => void;
}) {
  if (!error) return null;
  return (
    <Alert variant="destructive">
      <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
        <span>{error}</span>
        {onRetry ? (
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

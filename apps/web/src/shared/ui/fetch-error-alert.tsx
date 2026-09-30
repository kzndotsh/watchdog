import { Button } from "@/shared/ui/primitives/button";
import {
  Alert,
  AlertAction,
  AlertDescription,
} from "@watchdog/ui/components/alert";

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
      <AlertDescription>{error}</AlertDescription>
      {onRetry ? (
        <AlertAction>
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        </AlertAction>
      ) : null}
    </Alert>
  );
}

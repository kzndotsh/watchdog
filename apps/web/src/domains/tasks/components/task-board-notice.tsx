import { Alert, AlertDescription, AlertTitle } from "#ui/components/alert";
import { TASK_BOARD_MAX } from "@watchdog/domain/schemas/feed";

/** The board holds `TASK_BOARD_MAX` open cards; past it, narrow the view to see the rest. */
export function TaskBoardNotice() {
  return (
    <Alert>
      <AlertTitle>
        Showing the first {TASK_BOARD_MAX.toLocaleString()} open tasks
      </AlertTitle>
      <AlertDescription>
        More open tasks match. Filter by Entity or priority, or search, to see
        the rest.
      </AlertDescription>
    </Alert>
  );
}

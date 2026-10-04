import type { TaskRecord as CoreTaskRecord } from "@watchdog/core/tasks";
import type { EntityKind } from "@watchdog/schemas/shared";

export type TaskRecord = CoreTaskRecord;

export interface TaskEntityLabel {
  id: string;
  name: string;
  slug: string;
  kind: EntityKind;
}

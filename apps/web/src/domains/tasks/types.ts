import type { TaskRecord as CoreTaskRecord } from "@watchdog/core";
import type { EntityKind } from "@watchdog/schemas";

export type TaskRecord = CoreTaskRecord;

export interface TaskEntityLabel {
  id: string;
  name: string;
  slug: string;
  kind: EntityKind;
}

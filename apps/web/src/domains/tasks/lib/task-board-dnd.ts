import type { SortingStrategy } from "@dnd-kit/sortable";

import type { TaskRecord } from "@/domains/tasks/types";
import { TASK_STATUSES, type TaskStatus } from "@watchdog/schemas";

/** Keep list items still while DragOverlay is the only moving card. */
export const frozenSortingStrategy: SortingStrategy = () => null;

export function isBoardColumn(id: string): id is TaskStatus {
  for (const col of TASK_STATUSES) {
    if (col === id) return true;
  }
  return false;
}

export function findContainer(
  itemId: string,
  byColumn: Record<TaskStatus, TaskRecord[]>
): TaskStatus | null {
  for (const col of TASK_STATUSES) {
    if (byColumn[col].some((t) => t.id === itemId)) return col;
  }
  return null;
}

export function resolveOverColumn(
  overId: string,
  byColumn: Record<TaskStatus, TaskRecord[]>
): TaskStatus | null {
  if (isBoardColumn(overId)) return overId;
  return findContainer(overId, byColumn);
}

export function emptyColumns(): Record<TaskStatus, TaskRecord[]> {
  return {
    backlog: [],
    in_progress: [],
    blocked: [],
    done: [],
    dropped: [],
  };
}

export function groupByStatus(
  items: readonly TaskRecord[]
): Record<TaskStatus, TaskRecord[]> {
  const map = emptyColumns();
  for (const item of items) {
    map[item.status].push(item);
  }
  return map;
}

/** Keep board order stable across refetches; refresh row data from the server. */
export function reconcileItems(
  prev: readonly TaskRecord[],
  next: readonly TaskRecord[]
): TaskRecord[] {
  if (prev.length === 0) return [...next];
  const nextById = new Map(next.map((item) => [item.id, item]));
  const used = new Set<string>();
  const ordered: TaskRecord[] = [];

  for (const item of prev) {
    const fresh = nextById.get(item.id);
    if (!fresh) continue;
    // Server still on the old column → keep optimistic placement so drop
    // doesn't flash the card back for a frame.
    ordered.push(
      item.status === fresh.status ? fresh : { ...fresh, status: item.status }
    );
    used.add(fresh.id);
  }
  for (const item of next) {
    if (!used.has(item.id)) ordered.push(item);
  }
  return ordered;
}

/** Place the card at a dest-column index without moving it during hover. */
export function insertAtColumnIndex(
  prev: readonly TaskRecord[],
  activeId: string,
  projected: TaskRecord,
  to: TaskStatus,
  index: number
): TaskRecord[] {
  const others = prev.filter((t) => t.id !== activeId);
  const targetItems = others.filter((t) => t.status === to);
  const rest = others.filter((t) => t.status !== to);
  const clamped = Math.max(0, Math.min(index, targetItems.length));
  const nextTarget = [...targetItems];
  nextTarget.splice(clamped, 0, projected);
  return [...rest, ...nextTarget];
}

/** Index in destItems to show a drop placeholder (0 = before first card). */
export function dropSlotIndex(
  overId: string,
  destItems: readonly { id: string }[],
  insertAfter: boolean
): number {
  if (isBoardColumn(overId)) return destItems.length;
  const overIndex = destItems.findIndex((t) => t.id === overId);
  if (overIndex === -1) return destItems.length;
  return insertAfter ? overIndex + 1 : overIndex;
}

/** Overlay center vs hovered card midpoint — flips as you cross the middle. */
export function insertAfterOver(
  activeTop: number | undefined,
  overTop: number,
  overHeight: number,
  activeHeight = 0
): boolean {
  if (activeTop === undefined) return false;
  const probeY = activeTop + activeHeight / 2;
  return probeY > overTop + overHeight / 2;
}

/** When collision lands on the dragged card, use the last real hover target. */
export function resolveDropOverId(
  overId: string,
  activeId: string,
  lastHoverId: string | null
): string {
  if (overId !== activeId) return overId;
  return lastHoverId ?? overId;
}

/**
 * Expand entity-scoped board reorder into the full case column order the API
 * expects. Non-entity tasks keep their relative slots; entity tasks take the
 * visible drag order.
 */
export function mergeEntityScopedColumnOrder(
  allTasks: readonly TaskRecord[],
  status: TaskStatus,
  entityId: string,
  visibleOrderedIds: readonly string[]
): string[] {
  const column = allTasks.filter((row) => row.status === status);
  const queue = [...visibleOrderedIds];
  const result: string[] = [];

  for (const row of column) {
    if (row.entityId === entityId) {
      const next = queue.shift();
      if (next === undefined) continue;
      result.push(next);
      continue;
    }
    result.push(row.id);
  }

  for (const id of queue) {
    if (!result.includes(id)) result.push(id);
  }

  for (const row of column) {
    if (row.entityId === entityId && !result.includes(row.id)) {
      result.push(row.id);
    }
  }

  return result;
}

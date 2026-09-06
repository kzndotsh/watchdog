import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useMemo, useRef, useState } from "react";

import { TaskBoardColumn } from "@/domains/tasks/components/task-board-column";
import { TaskCardPreview } from "@/domains/tasks/components/task-card";
import { useLiveRegion } from "@/domains/tasks/hooks/use-live-region";
import {
  dropSlotIndex,
  findContainer,
  groupByStatus,
  insertAfterOver,
  insertAtColumnIndex,
  isBoardColumn,
  reconcileItems,
  resolveDropOverId,
  resolveOverColumn,
} from "@/domains/tasks/lib/task-board-dnd";
import type { TaskEntityLabel, TaskRecord } from "@/domains/tasks/types";
import { taskStatusLabel } from "@/shared/ui/vocab";
import { TASK_STATUSES, type TaskStatus } from "@watchdog/schemas";

const boardCollisionDetection: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  const hits = pointerHits.length > 0 ? pointerHits : closestCorners(args);
  const cardHit = hits.find((hit) => !isBoardColumn(String(hit.id)));
  if (cardHit) return [cardHit];
  return hits[0] ? [hits[0]] : [];
};

interface Props {
  items: TaskRecord[];
  selectedId?: string | null;
  onSelect: (task: TaskRecord) => void;
  onDelete?: (task: TaskRecord) => void;
  onCommitDrop: (
    task: TaskRecord,
    status: TaskStatus,
    orderedIds: string[]
  ) => void | Promise<void>;
  onQuickCreate?: (status: TaskStatus, title: string) => void | Promise<void>;
  quickCreateBusy?: boolean;
  entityById?: Map<string, TaskEntityLabel>;
}

function withPendingStatus(
  rows: TaskRecord[],
  pending: Map<string, TaskStatus>
): TaskRecord[] {
  if (pending.size === 0) return rows;
  return rows.map((item) => {
    const status = pending.get(item.id);
    return status !== undefined && status !== item.status
      ? { ...item, status }
      : item;
  });
}

export function TaskBoard({
  items,
  selectedId,
  onSelect,
  onDelete,
  onCommitDrop,
  onQuickCreate,
  quickCreateBusy,
  entityById,
}: Props) {
  const { announce, liveRegion } = useLiveRegion();
  const [activeItem, setActiveItem] = useState<TaskRecord | null>(null);
  const originColumnRef = useRef<TaskStatus | null>(null);
  const [overColumn, setOverColumn] = useState<TaskStatus | null>(null);
  const [localItems, setLocalItems] = useState(items);
  const [pendingStatus, setPendingStatus] = useState<Map<string, TaskStatus>>(
    () => new Map()
  );
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [overlayWidth, setOverlayWidth] = useState<number | null>(null);
  const lastHoverRef = useRef<string | null>(null);
  const dropGenRef = useRef(0);

  const idleItems = withPendingStatus(
    reconcileItems(localItems, items),
    pendingStatus
  );
  const displayItems = activeItem ? localItems : idleItems;
  const byColumn = useMemo(() => groupByStatus(displayItems), [displayItems]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragStart(event: DragStartEvent) {
    const snapshot = withPendingStatus(
      reconcileItems(localItems, items),
      pendingStatus
    );
    setLocalItems(snapshot);
    const item = snapshot.find((t) => t.id === event.active.id);
    if (!item) return;
    setActiveItem(item);
    originColumnRef.current = item.status;
    const originIndex = groupByStatus(snapshot)[item.status].findIndex(
      (t) => t.id === item.id
    );
    setDropIndex(originIndex === -1 ? 0 : originIndex);
    setOverlayWidth(
      event.active.rect.current.initial?.width ??
        event.active.rect.current.translated?.width ??
        null
    );
    lastHoverRef.current = null;
  }

  function syncDropTarget(event: DragOverEvent | DragMoveEvent) {
    const { active, over } = event;
    if (!over) {
      setOverColumn(null);
      setDropIndex(null);
      return;
    }

    const activeId = String(active.id);
    const overId = String(over.id);
    if (overId !== activeId) lastHoverRef.current = overId;
    const from = findContainer(activeId, byColumn);
    const slotOverId = resolveDropOverId(
      overId,
      activeId,
      lastHoverRef.current
    );
    const to = resolveOverColumn(slotOverId, byColumn);
    setOverColumn(to);
    if (!from || !to) {
      setDropIndex(null);
      return;
    }
    if (overId === activeId) return;
    if (isBoardColumn(slotOverId)) return;

    const destItems = byColumn[to].filter((t) => t.id !== activeId);
    const translated = active.rect.current.translated;
    setDropIndex(
      dropSlotIndex(
        slotOverId,
        destItems,
        insertAfterOver(
          translated?.top,
          over.rect.top,
          over.rect.height,
          translated?.height ?? 0
        )
      )
    );
  }

  function handleDragOver(event: DragOverEvent) {
    syncDropTarget(event);
  }

  function handleDragMove(event: DragMoveEvent) {
    syncDropTarget(event);
  }

  function clearDrag() {
    setActiveItem(null);
    originColumnRef.current = null;
    setOverColumn(null);
    setDropIndex(null);
    setOverlayWidth(null);
  }

  async function settleDrop(
    gen: number,
    original: TaskRecord,
    from: TaskStatus,
    to: TaskStatus,
    orderedIds: string[],
    movedColumn: boolean
  ) {
    try {
      await onCommitDrop(original, to, orderedIds);
      if (gen !== dropGenRef.current) return;
      setPendingStatus((prev) => {
        const next = new Map(prev);
        next.delete(original.id);
        return next;
      });
      announce(
        movedColumn
          ? `Moved ${original.title} to ${taskStatusLabel(to)}`
          : `Reordered ${original.title} in ${taskStatusLabel(to)}`
      );
    } catch {
      if (gen !== dropGenRef.current) return;
      setPendingStatus((prev) => {
        const next = new Map(prev);
        next.delete(original.id);
        return next;
      });
      setLocalItems((prev) =>
        prev.map((item) =>
          item.id === original.id ? { ...item, status: from } : item
        )
      );
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const original = activeItem;
    const from = originColumnRef.current;
    dropGenRef.current += 1;
    const gen = dropGenRef.current;

    if (!original || !from || !over) {
      clearDrag();
      return;
    }

    const activeId = String(active.id);
    const overId = String(over.id);
    if (overId !== activeId) lastHoverRef.current = overId;
    const slotOverId = resolveDropOverId(
      overId,
      activeId,
      lastHoverRef.current
    );
    const to =
      resolveOverColumn(slotOverId, byColumn) ??
      findContainer(activeId, byColumn);

    if (!to) {
      clearDrag();
      return;
    }

    const destItems = byColumn[to].filter((t) => t.id !== original.id);
    const translated = active.rect.current.translated;
    const insertAt = isBoardColumn(slotOverId)
      ? (dropIndex ?? destItems.length)
      : dropSlotIndex(
          slotOverId,
          destItems,
          insertAfterOver(
            translated?.top,
            over.rect.top,
            over.rect.height,
            translated?.height ?? 0
          )
        );

    const nextItems = insertAtColumnIndex(
      localItems,
      original.id,
      { ...original, status: to },
      to,
      insertAt
    );
    setLocalItems(nextItems);
    const orderedIds = groupByStatus(nextItems)[to].map((t) => t.id);

    setPendingStatus((prev) => new Map([...prev, [original.id, to]]));

    const movedColumn = from !== to;
    void settleDrop(gen, original, from, to, orderedIds, movedColumn);
    clearDrag();
  }

  function handleDragCancel() {
    clearDrag();
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <DndContext
        sensors={sensors}
        collisionDetection={boardCollisionDetection}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {liveRegion}
        <div className="divide-border flex h-full min-h-0 w-full flex-1 divide-x overflow-x-auto">
          {TASK_STATUSES.map((col) => (
            <TaskBoardColumn
              key={col}
              column={col}
              items={byColumn[col]}
              selectedId={selectedId}
              onSelect={onSelect}
              onDelete={onDelete}
              onQuickCreate={onQuickCreate}
              quickCreateBusy={quickCreateBusy}
              entityById={entityById}
              isDropTarget={!!activeItem && overColumn === col}
              activeItem={activeItem}
              dropSlotIndex={
                activeItem && overColumn === col ? dropIndex : null
              }
            />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeItem ? (
            <div
              className="cursor-grabbing"
              style={overlayWidth ? { width: overlayWidth } : undefined}
            >
              <TaskCardPreview task={activeItem} entityById={entityById} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

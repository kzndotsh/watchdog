import { useDroppable } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { PlusIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  TaskCard,
  TaskCardPreview,
} from "@/domains/tasks/components/task-card";
import { frozenSortingStrategy } from "@/domains/tasks/lib/task-board-dnd";
import type { TaskEntityLabel, TaskRecord } from "@/domains/tasks/types";
import { SectionLabel } from "@/shared/ui/section-label";
import { Button } from "@/shared/ui/shadcn/button";
import { Input } from "@/shared/ui/shadcn/input";
import { ScrollArea } from "@/shared/ui/shadcn/scroll-area";
import { TabCount } from "@/shared/ui/tab-count";
import { TASK_BOARD_COLUMN_SHELL_CLASS } from "@/shared/ui/task-board-shell";
import { taskStatusLabel } from "@/shared/ui/vocab";
import type { TaskStatus } from "@watchdog/schemas";

interface Props {
  column: TaskStatus;
  items: TaskRecord[];
  selectedId?: string | null;
  onSelect: (task: TaskRecord) => void;
  onQuickCreate?: (status: TaskStatus, title: string) => void | Promise<void>;
  quickCreateBusy?: boolean;
  entityById?: Map<string, TaskEntityLabel>;
  isDropTarget?: boolean;
  activeItem?: TaskRecord | null;
  dropSlotIndex?: number | null;
}

function DropSlot({
  task,
  entityById,
}: {
  task: TaskRecord;
  entityById?: Map<string, TaskEntityLabel>;
}) {
  return (
    <div
      aria-hidden
      className="border-primary/70 bg-primary/5 rounded-md border border-dashed"
    >
      <div className="invisible">
        <TaskCardPreview task={task} entityById={entityById} />
      </div>
    </div>
  );
}

export function TaskBoardColumn({
  column,
  items,
  selectedId,
  onSelect,
  onQuickCreate,
  quickCreateBusy = false,
  entityById,
  isDropTarget,
  activeItem,
  dropSlotIndex = null,
}: Props) {
  const { setNodeRef } = useDroppable({
    id: column,
    data: { column, type: "column" },
  });

  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const listed = activeItem
    ? items.filter((item) => item.id !== activeItem.id)
    : items;
  const empty = listed.length === 0;

  useEffect(() => {
    if (composing) {
      inputRef.current?.focus();
    }
  }, [composing]);

  function openComposer() {
    if (!onQuickCreate || quickCreateBusy) return;
    setComposing(true);
  }

  function closeComposer() {
    setTitle("");
    setComposing(false);
  }

  async function submitComposer() {
    const trimmed = title.trim();
    if (!trimmed || !onQuickCreate || quickCreateBusy) return;
    await onQuickCreate(column, trimmed);
    setTitle("");
    setComposing(false);
  }

  return (
    <div className={TASK_BOARD_COLUMN_SHELL_CLASS}>
      <header className="border-border bg-background/95 sticky top-0 z-[1] flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2 backdrop-blur-sm">
        <SectionLabel as="h3">
          {taskStatusLabel(column)}
          <TabCount n={items.length} />
        </SectionLabel>
        {onQuickCreate ? (
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            className="size-5"
            aria-label={`Add task to ${taskStatusLabel(column)}`}
            disabled={quickCreateBusy}
            onClick={openComposer}
          >
            <PlusIcon className="size-3" />
          </Button>
        ) : null}
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <div
          ref={setNodeRef}
          className="flex min-h-[8rem] flex-col gap-1.5 p-2"
        >
          <SortableContext
            id={column}
            items={listed.map((t) => t.id)}
            strategy={frozenSortingStrategy}
          >
            {listed.flatMap((item, i) => {
              const card = (
                <TaskCard
                  key={item.id}
                  task={item}
                  selected={selectedId === item.id}
                  onSelect={onSelect}
                  entityById={entityById}
                />
              );
              if (activeItem && isDropTarget && dropSlotIndex === i) {
                return [
                  <DropSlot
                    key="drop-slot"
                    task={activeItem}
                    entityById={entityById}
                  />,
                  card,
                ];
              }
              return [card];
            })}
            {activeItem &&
            isDropTarget &&
            (dropSlotIndex === listed.length ||
              (empty && dropSlotIndex === null)) ? (
              <DropSlot
                key="drop-slot-end"
                task={activeItem}
                entityById={entityById}
              />
            ) : null}
          </SortableContext>

          {composing ? (
            <div className="border-border bg-card flex flex-col gap-1.5 rounded-md border px-2 py-1.5 shadow-xs">
              <Input
                ref={inputRef}
                value={title}
                disabled={quickCreateBusy}
                placeholder="Task title"
                aria-label={`New ${taskStatusLabel(column)} task title`}
                className="h-8 border-0 bg-transparent shadow-none focus-visible:ring-0"
                onChange={(e) => {
                  setTitle(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && title.trim()) {
                    e.preventDefault();
                    void submitComposer();
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    closeComposer();
                  }
                }}
              />
              <div className="flex items-center justify-end gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  disabled={quickCreateBusy}
                  onClick={closeComposer}
                >
                  <XIcon className="size-3.5" />
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-7 px-2"
                  disabled={!title.trim() || quickCreateBusy}
                  onClick={() => {
                    void submitComposer();
                  }}
                >
                  <PlusIcon className="size-3.5" />
                  {quickCreateBusy ? "Adding…" : "Add"}
                </Button>
              </div>
            </div>
          ) : null}
          {!composing && onQuickCreate ? (
            <button
              type="button"
              className="border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground hover:bg-muted/30 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed px-2 py-1.5 text-xs transition-colors"
              disabled={quickCreateBusy}
              onClick={openComposer}
            >
              <PlusIcon className="size-3.5" />
              Add task
            </button>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}

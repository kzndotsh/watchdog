import { useDroppable } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { PlusIcon, XIcon } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

import { TaskCard } from "@/domains/tasks/components/task-card";
import { TaskCardPreview } from "@/domains/tasks/components/task-card-preview";
import { frozenSortingStrategy } from "@/domains/tasks/lib/task-board-dnd";
import type { TaskListItem, TaskRecord } from "@/domains/tasks/types";
import { Button } from "@/shared/ui/primitives/button";
import { SectionLabel } from "@/shared/ui/section-label";
import { TabCount } from "@/shared/ui/tab-count";
import { TASK_BOARD_COLUMN_SHELL_CLASS } from "@/shared/ui/task-board-shell";
import { taskStatusLabel } from "@/shared/ui/vocab";
import type { TaskStatus } from "@watchdog/schemas/shared";
import { Input } from "@watchdog/ui/components/input";
import { ScrollArea } from "@watchdog/ui/components/scroll-area";

/**
 * A finished column (Done, Dropped) is a paged list: its count is the list's total, and its
 * body goes through the list's states (`ListBody`: loading, empty, Load more) around the cards.
 */
export type TaskColumnList = {
  readonly count: ReactElement;
  readonly body: (cards: ReactNode) => ReactNode;
};

type Props = {
  column: TaskStatus;
  items: TaskListItem[];
  selectedId?: string | null;
  onSelect: (task: TaskRecord) => void;
  onDelete?: (task: TaskRecord) => void;
  onQuickCreate?: (status: TaskStatus, title: string) => void | Promise<void>;
  isQuickCreateBusy?: boolean;
  isDropTarget?: boolean;
  activeItem?: TaskListItem | null;
  dropSlotIndex?: number | null;
  /** Present for a finished column: the list behind it. */
  list?: TaskColumnList;
};

function DropSlot({ task }: { task: TaskListItem }) {
  return (
    <div
      aria-hidden
      className="border-primary/70 bg-primary/5 rounded-md border border-dashed"
    >
      <div className="invisible">
        <TaskCardPreview task={task} />
      </div>
    </div>
  );
}

export function TaskBoardColumn({
  column,
  items,
  selectedId,
  onSelect,
  onDelete,
  onQuickCreate,
  isQuickCreateBusy = false,
  isDropTarget,
  activeItem,
  dropSlotIndex = null,
  list,
}: Props) {
  const { setNodeRef } = useDroppable({
    id: column,
    data: { column, type: "column" },
  });

  const [isComposing, setIsComposing] = useState(false);
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const listed = activeItem
    ? items.filter((item) => item.id !== activeItem.id)
    : items;
  const isEmpty = listed.length === 0;

  useEffect(() => {
    if (isComposing) {
      inputRef.current?.focus();
    }
  }, [isComposing]);

  function handleOpenComposer() {
    if (!onQuickCreate || isQuickCreateBusy) return;
    setIsComposing(true);
  }

  function handleCloseComposer() {
    setTitle("");
    setIsComposing(false);
  }

  async function submitComposer() {
    const trimmed = title.trim();
    if (!trimmed || !onQuickCreate || isQuickCreateBusy) return;
    await onQuickCreate(column, trimmed);
    setTitle("");
    setIsComposing(false);
  }

  const cards = (
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
            isSelected={selectedId === item.id}
            onSelect={onSelect}
            onDelete={onDelete}
          />
        );
        if (activeItem && isDropTarget && dropSlotIndex === i) {
          return [<DropSlot key="drop-slot" task={activeItem} />, card];
        }
        return [card];
      })}
      {activeItem &&
      isDropTarget &&
      (dropSlotIndex === listed.length ||
        (isEmpty && dropSlotIndex === null)) ? (
        <DropSlot key="drop-slot-end" task={activeItem} />
      ) : null}
    </SortableContext>
  );

  return (
    <div className={TASK_BOARD_COLUMN_SHELL_CLASS}>
      <header className="border-border bg-background sticky top-0 z-[1] flex shrink-0 items-center justify-between gap-2 border-b px-2.5 py-2">
        <SectionLabel as="h3">
          {taskStatusLabel(column)}
          <TabCount n={list?.count ?? items.length} />
        </SectionLabel>
        {onQuickCreate ? (
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label={`Add task to ${taskStatusLabel(column)}`}
            disabled={isQuickCreateBusy}
            onClick={handleOpenComposer}
          >
            <PlusIcon className="size-3" />
          </Button>
        ) : null}
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <div
          ref={setNodeRef}
          className="flex min-h-[8rem] flex-col gap-1.5 p-1.5"
        >
          {list ? list.body(cards) : cards}

          {isComposing ? (
            <div className="border-border bg-card flex flex-col gap-1.5 rounded-md border px-2 py-1.5 shadow-xs">
              <Input
                ref={inputRef}
                value={title}
                disabled={isQuickCreateBusy}
                placeholder="Task title"
                aria-label={`New ${taskStatusLabel(column)} task title`}
                className="h-8"
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
                    handleCloseComposer();
                  }
                }}
              />
              <div className="flex items-center justify-end gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={isQuickCreateBusy}
                  onClick={handleCloseComposer}
                >
                  <XIcon className="size-3.5" />
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!title.trim() || isQuickCreateBusy}
                  onClick={() => {
                    void submitComposer();
                  }}
                >
                  <PlusIcon className="size-3.5" />
                  {isQuickCreateBusy ? "Adding…" : "Add"}
                </Button>
              </div>
            </div>
          ) : null}
          {!isComposing && onQuickCreate ? (
            <button
              type="button"
              className="border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground hover:bg-muted/30 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed px-2 py-1.5 text-xs transition-colors"
              disabled={isQuickCreateBusy}
              onClick={handleOpenComposer}
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

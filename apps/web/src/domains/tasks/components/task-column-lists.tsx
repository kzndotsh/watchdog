import type { ReactNode } from "react";

import type { TaskColumnList } from "@/domains/tasks/components/task-board-column";
import type { TaskClosedLists } from "@/domains/tasks/hooks/use-task-workspace";
import type { TaskListItem } from "@/domains/tasks/types";
import type { ListHandle } from "@/shared/lib/list/list-types";
import { ListBody } from "@/shared/ui/list/list-body";
import { ListCount } from "@/shared/ui/list/list-count";
import { TaskColumnCardsSkeleton } from "@/shared/ui/skeletons";
import type { taskList } from "@watchdog/schemas/feed";
import type { FilterKey, TaskStatus } from "@watchdog/schemas/shared";

function columnListOf<K extends FilterKey<typeof taskList>>(
  list: ListHandle<typeof taskList, TaskListItem, K>
): TaskColumnList {
  return {
    count: (
      <ListCount
        count={list.count}
        noun={list.def.noun}
        variant="compact"
        isLive={false}
      />
    ),
    // A block wrapper: in the column's flex body, ListBody's flex-1 would stretch to the column's
    // minimum height and push the Add task row below where the open columns have it.
    body: (cards: ReactNode) => (
      <div>
        <ListBody
          list={list}
          skeleton={<TaskColumnCardsSkeleton />}
          shouldHideBlank
        >
          {() => <div className="flex flex-col gap-1.5">{cards}</div>}
        </ListBody>
      </div>
    ),
  };
}

/** Done and Dropped as board columns: the Task list's states and footer around the cards. */
export function taskColumnLists<K extends FilterKey<typeof taskList>>(
  closed: TaskClosedLists<K>
): Partial<Record<TaskStatus, TaskColumnList>> {
  return {
    done: columnListOf(closed.done),
    dropped: columnListOf(closed.dropped),
  };
}

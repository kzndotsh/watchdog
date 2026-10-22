import { Link } from "@tanstack/react-router";
import { ArrowRightIcon } from "lucide-react";
import { Fragment, useMemo, useState } from "react";

import { LibraryFailurePicker } from "@/domains/library/components/library-failure-picker";
import { LibraryReadinessDot } from "@/domains/library/components/library-readiness-dot";
import { failureNote } from "@/domains/library/lib/playbook-graph";
import {
  buildStageLayout,
  stageCardState,
} from "@/domains/library/lib/playbook-stages";
import type { LibraryStep } from "@/domains/library/types";
import { cn } from "@/lib/utils";
import { LIBRARY_ENTRY_BOX_CLASS } from "@/shared/ui/library-shell";

export type LibraryPlaybookStagesProps = {
  steps: readonly LibraryStep[];
};

/** Left-to-right stages with small arrows; pick a failing step below to see what it skips. */
export function LibraryPlaybookStages({ steps }: LibraryPlaybookStagesProps) {
  const [failedIndex, setFailedIndex] = useState<number | null>(null);
  const { nodes, columns } = useMemo(() => buildStageLayout(steps), [steps]);
  const failed = failedIndex === null ? undefined : nodes[failedIndex];

  return (
    <div className="flex flex-col gap-4">
      <div className="-mx-4 flex items-stretch gap-2 overflow-x-auto px-4 pb-2">
        {columns.map((column, columnIndex) => (
          <Fragment key={column.label}>
            {columnIndex === 0 ? null : (
              <div className="text-muted-foreground flex items-center">
                <ArrowRightIcon aria-hidden className="size-3.5" />
              </div>
            )}
            <div className="flex w-52 shrink-0 flex-col gap-2">
              <span className="text-muted-foreground text-xs">
                {column.label}
              </span>
              {column.cards.map(({ node, step, number }) => {
                const { isFailed, isSkipped } = stageCardState(
                  nodes,
                  failedIndex,
                  node.index
                );
                return (
                  <div
                    key={node.index}
                    className={cn(
                      LIBRARY_ENTRY_BOX_CLASS,
                      isFailed && "border-destructive",
                      isSkipped && "opacity-40"
                    )}
                  >
                    <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                      <LibraryReadinessDot readiness={step.readiness} />
                      Step {number}
                      {isSkipped ? " (skipped)" : ""}
                    </div>
                    <Link
                      to="/library/caps/$capId"
                      params={{ capId: step.capId }}
                      className="text-primary w-fit font-medium hover:underline"
                    >
                      {step.title}
                    </Link>
                  </div>
                );
              })}
            </div>
          </Fragment>
        ))}
      </div>
      <LibraryFailurePicker
        stepCount={steps.length}
        failedIndex={failedIndex}
        onChange={setFailedIndex}
      />
      {failed === undefined ? null : (
        <p role="status" className="text-muted-foreground text-sm">
          {failureNote(failed)}
        </p>
      )}
    </div>
  );
}

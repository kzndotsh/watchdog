import { Link } from "@tanstack/react-router";
import { ArrowRightIcon } from "lucide-react";
import { Fragment, useMemo, useState } from "react";

import { LibraryFailurePicker } from "@/domains/library/components/library-failure-picker";
import { LibraryKindText } from "@/domains/library/components/library-kind-text";
import { LibraryReadinessDot } from "@/domains/library/components/library-readiness-dot";
import type { CapKindChip } from "@/domains/library/lib/cap-detail";
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
  /** The seed kinds it starts from, and what its steps produce between them. */
  gives: readonly CapKindChip[];
  gets: readonly CapKindChip[];
};

type EndColumnProps = { label: string; chips: readonly CapKindChip[] };

/** "What you give" or "What you get": labelled like a stage column so the row reads as one flow. */
function EndColumn({ label, chips }: EndColumnProps) {
  return (
    <div className="flex w-44 shrink-0 flex-col gap-2">
      <span className="text-muted-foreground text-xs">{label}</span>
      <div className={LIBRARY_ENTRY_BOX_CLASS}>
        <LibraryKindText chips={chips} />
      </div>
    </div>
  );
}

function StageArrow() {
  return (
    <div className="text-muted-foreground flex items-center">
      <ArrowRightIcon aria-hidden className="size-3.5" />
    </div>
  );
}

/**
 * The Playbook as one left-to-right flow, like a Cap's: what you give, the stages of steps, what
 * you get. Pick a failing step below to see what it skips.
 */
export function LibraryPlaybookStages({
  steps,
  gives,
  gets,
}: LibraryPlaybookStagesProps) {
  const [failedIndex, setFailedIndex] = useState<number | null>(null);
  const { nodes, columns } = useMemo(() => buildStageLayout(steps), [steps]);
  const failed = failedIndex === null ? undefined : nodes[failedIndex];

  return (
    <div className="flex flex-col gap-4">
      <div className="-mx-4 flex items-stretch gap-2 overflow-x-auto px-4 pb-2">
        <EndColumn label="What you give" chips={gives} />
        {columns.map((column, columnIndex) => (
          <Fragment key={columnIndex}>
            <StageArrow />
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
        <StageArrow />
        <EndColumn label="What you get" chips={gets} />
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

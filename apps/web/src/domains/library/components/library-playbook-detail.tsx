import { useMemo, useState } from "react";

import { LibraryReadinessBadge } from "@/domains/library/components/library-readiness-badge";
import { inputKindLabel } from "@/domains/library/lib/input-kinds";
import {
  buildPlaybookGraph,
  playbookStages,
  type PlaybookGraphNode,
} from "@/domains/library/lib/playbook-graph";
import {
  rollUpReadiness,
  rollupSummary,
} from "@/domains/library/lib/playbook-rollup";
import type { LibraryEntry, LibraryStep } from "@/domains/library/types";
import { Chip } from "@/shared/ui/chip";
import { Button } from "@/shared/ui/primitives/button";
import { SectionLabel } from "@/shared/ui/section-label";

export type LibraryPlaybookDetailProps = {
  entry: LibraryEntry;
};

/** Step numbers as an investigator counts them: 1-based, "step 2" or "steps 2, 3". */
function stepNumbers(indexes: readonly number[]): string {
  const label = indexes.length === 1 ? "step" : "steps";
  return `${label} ${indexes.map((i) => i + 1).join(", ")}`;
}

type StepRowProps = {
  node: PlaybookGraphNode;
  step: LibraryStep;
  isFailed: boolean;
  onToggle: () => void;
};

function StepRow({ node, step, isFailed, onToggle }: StepRowProps) {
  const number = node.index + 1;
  return (
    <li className="flex flex-col gap-1 rounded-md border p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-xs">Step {number}</span>
        <a
          href={`/library/caps/${encodeURIComponent(step.capId)}`}
          className="font-medium underline-offset-2 hover:underline"
        >
          {step.title}
        </a>
        <LibraryReadinessBadge readiness={step.readiness} />
        <Button
          type="button"
          size="xs"
          variant={isFailed ? "secondary" : "outline"}
          aria-pressed={isFailed}
          onClick={onToggle}
          className="ml-auto"
        >
          If step {number} fails
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        {node.dependsOn.length === 0
          ? "Starts from the seed."
          : `Reads from ${stepNumbers(node.dependsOn)}.`}
        {node.independentOf.length === 0
          ? ""
          : ` Independent of ${stepNumbers(node.independentOf)}.`}
      </p>
    </li>
  );
}

function FailureImpact({
  failed,
  steps,
}: {
  failed: PlaybookGraphNode;
  steps: readonly LibraryStep[];
}) {
  const origin = `Step ${failed.index + 1} (${steps[failed.index]?.title ?? ""})`;
  return (
    <p role="status" className="text-sm">
      {failed.skippedIfFailed.length === 0
        ? `${origin} failing skips no other step.`
        : `${origin} failing skips ${failed.skippedIfFailed
            .map((i) => `step ${i + 1} (${steps[i]?.title ?? ""})`)
            .join(", ")}.`}
    </p>
  );
}

/**
 * Playbook detail: the seed kinds it takes (each one opens the Library's "start from what you
 * have" view), a readiness roll-up over its steps, and the steps as stages of a dependency
 * graph. Steps in one stage are independent; picking "If step N fails" shows what that skips.
 */
export function LibraryPlaybookDetail({ entry }: LibraryPlaybookDetailProps) {
  const { steps } = entry;
  const [failedIndex, setFailedIndex] = useState<number | null>(null);
  const nodes = useMemo(
    () =>
      buildPlaybookGraph(
        steps.map((step) => step.dependsOn),
        steps.length
      ),
    [steps]
  );
  const stages = useMemo(() => playbookStages(nodes), [nodes]);
  const summary = rollupSummary(rollUpReadiness(steps));
  const failed = failedIndex === null ? undefined : nodes[failedIndex];

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <SectionLabel>Starts from</SectionLabel>
        <ul className="flex flex-wrap gap-1.5">
          {entry.inputKinds.map((kind) => (
            <li key={kind}>
              <a href={`/library?kind=${encodeURIComponent(kind)}`}>
                <Chip>{inputKindLabel(kind)}</Chip>
              </a>
            </li>
          ))}
        </ul>
      </section>
      <section className="flex flex-col gap-1">
        <SectionLabel>Readiness</SectionLabel>
        <p className="text-sm">{summary}</p>
      </section>
      <section className="flex flex-col gap-2">
        <SectionLabel>Steps</SectionLabel>
        <ol className="flex flex-col gap-3">
          {stages.map((stage, stageIndex) => (
            <li key={stageIndex} className="flex flex-col gap-1.5">
              <p className="text-muted-foreground text-xs">
                {stageIndex === 0
                  ? "First: needs only the seed"
                  : `Then, stage ${stageIndex + 1}: needs an earlier step`}
              </p>
              <ul className="flex flex-col gap-1.5">
                {stage.map((node) => {
                  const step = steps[node.index];
                  return step === undefined ? null : (
                    <StepRow
                      key={node.index}
                      node={node}
                      step={step}
                      isFailed={failedIndex === node.index}
                      onToggle={() => {
                        setFailedIndex((current) =>
                          current === node.index ? null : node.index
                        );
                      }}
                    />
                  );
                })}
              </ul>
            </li>
          ))}
        </ol>
        {failed === undefined ? null : (
          <FailureImpact failed={failed} steps={steps} />
        )}
      </section>
    </div>
  );
}

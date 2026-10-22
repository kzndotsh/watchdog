import {
  buildPlaybookGraph,
  playbookStages,
  stageLabel,
  type PlaybookGraphNode,
} from "@/domains/library/lib/playbook-graph";
import type { LibraryStep } from "@/domains/library/types";

export type StageCard = {
  node: PlaybookGraphNode;
  step: LibraryStep;
  /** 1-based, as the reader counts. */
  number: number;
};

export type StageColumn = {
  label: string;
  cards: StageCard[];
};

export type PlaybookStageLayout = {
  nodes: PlaybookGraphNode[];
  columns: StageColumn[];
};

/** A Playbook's steps as left-to-right stage columns, each step beside its graph node. */
export function buildStageLayout(
  steps: readonly LibraryStep[]
): PlaybookStageLayout {
  const nodes = buildPlaybookGraph(
    steps.map((step) => step.dependsOn),
    steps.length
  );
  const columns = playbookStages(nodes).map((stage, stageIndex) => ({
    label: stageLabel(stageIndex),
    cards: stage.flatMap((node) => {
      const step = steps[node.index];
      return step === undefined ? [] : [{ node, step, number: node.index + 1 }];
    }),
  }));
  return { nodes, columns };
}

/** Whether a card is the picked failing step, or one that failure would skip. */
export function stageCardState(
  nodes: readonly PlaybookGraphNode[],
  failedIndex: number | null,
  index: number
): { isFailed: boolean; isSkipped: boolean } {
  const failed = failedIndex === null ? undefined : nodes[failedIndex];
  return {
    isFailed: failedIndex === index,
    isSkipped: failed?.skippedIfFailed.includes(index) ?? false,
  };
}

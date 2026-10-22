/** A Playbook step placed in the dependency graph. All step numbers are 0-based indexes. */
export type PlaybookGraphNode = {
  index: number;
  /** Steps it reads from, transitively. */
  dependsOn: number[];
  /** Steps that would be skipped if this one failed (everything downstream, transitively). */
  skippedIfFailed: number[];
  /** Steps with no dependency path either way: they can run alongside this one. */
  independentOf: number[];
  /** 0 for a step that needs no other step, else one past its latest dependency. */
  stage: number;
};

/**
 * The dependency graph of a Playbook from `playbookStepDependencies`: per step, the earlier
 * steps it depends on (transitively). A missing row means no dependencies.
 */
export function buildPlaybookGraph(
  dependencies: readonly (readonly number[])[],
  stepCount: number = dependencies.length
): PlaybookGraphNode[] {
  const dependsOn = Array.from({ length: stepCount }, (_, i) =>
    [...new Set(dependencies[i])]
      .filter((d) => d >= 0 && d < i)
      .sort((a, b) => a - b)
  );
  const stages: number[] = [];
  for (const [i, deps] of dependsOn.entries()) {
    let stage = 0;
    for (const d of deps) stage = Math.max(stage, (stages[d] ?? 0) + 1);
    stages[i] = stage;
  }
  return dependsOn.map((deps, i) => {
    const skippedIfFailed = dependsOn.flatMap((other, j) =>
      other.includes(i) ? [j] : []
    );
    const independentOf = dependsOn.flatMap((other, j) =>
      j !== i && !deps.includes(j) && !other.includes(i) ? [j] : []
    );
    return {
      index: i,
      dependsOn: deps,
      skippedIfFailed,
      independentOf,
      stage: stages[i] ?? 0,
    };
  });
}

/** Steps grouped by stage: every step in a stage is independent of the others in it. */
export function playbookStages(
  nodes: readonly PlaybookGraphNode[]
): PlaybookGraphNode[][] {
  const stages: PlaybookGraphNode[][] = [];
  for (const node of nodes) {
    (stages[node.stage] ??= []).push(node);
  }
  return stages;
}

/** Step numbers as an investigator counts them: 1-based, "step 2" or "steps 2, 3". */
export function stepNumbers(indexes: readonly number[]): string {
  const label = indexes.length === 1 ? "step" : "steps";
  return `${label} ${indexes.map((i) => i + 1).join(", ")}`;
}

/** The caption over a stage's column: the order reads from the layout, never the word "stage". */
export function stageLabel(stageIndex: number): string {
  return stageIndex === 0 ? "Runs first" : "Then";
}

/** What picking "If step N fails" tells the reader. */
export function failureNote(failed: PlaybookGraphNode): string {
  const number = failed.index + 1;
  return failed.skippedIfFailed.length === 0
    ? `If step ${number} fails, no other step is skipped.`
    : `If step ${number} fails, ${stepNumbers(failed.skippedIfFailed)} would be skipped.`;
}

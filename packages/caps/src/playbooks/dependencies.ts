import type { PlaybookDef, PlaybookStepDef } from "./plan";
import { normalizePlaybookStep } from "./plan";

/** The steps a step reads directly: its `bind[*].step` sources and its `fanOut.from.step`. */
function directStepDependencies(def: PlaybookStepDef): number[] {
  const sources = new Set<number>();
  for (const bind of Object.values(def.bind ?? {})) {
    if ("step" in bind) sources.add(bind.step);
  }
  if (def.fanOut !== undefined) sources.add(def.fanOut.from.step);
  return [...sources];
}

/**
 * Per step, the steps it depends on (transitively), ascending. A step depends on step N when a
 * `bind` or `fanOut` reads N's output; a plain step, or one bound only to the seed, depends on
 * nothing. Sources are earlier steps (`planPlaybook` rejects the rest), so one forward pass
 * closes the relation.
 */
export function playbookStepDependencies(
  playbook: PlaybookDef
): readonly (readonly number[])[] {
  const closures: Set<number>[] = [];
  for (const step of playbook.steps) {
    const closure = new Set<number>();
    for (const source of directStepDependencies(normalizePlaybookStep(step))) {
      closure.add(source);
      for (const inherited of closures[source] ?? []) closure.add(inherited);
    }
    closures.push(closure);
  }
  return closures.map((closure) => [...closure].sort((a, b) => a - b));
}

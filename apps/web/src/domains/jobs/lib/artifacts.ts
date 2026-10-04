import {
  DERIVED_JSON_ARTIFACT,
  EVIDENCE_SNAPSHOT_ARTIFACT,
  REPORT_JSON_ARTIFACT,
} from "@watchdog/schemas/jobs";

interface NamedArtifact {
  name: string;
}

/** Job Output display order: derived → report → rest. */
export function orderJobArtifacts<T extends NamedArtifact>(output: T[]): T[] {
  const derived = output.find((a) => a.name === DERIVED_JSON_ARTIFACT);
  const report = output.find((a) => a.name === REPORT_JSON_ARTIFACT);
  const preferred = [derived, report].filter((a): a is T => Boolean(a));
  const rest = output.filter(
    (a) => a.name !== DERIVED_JSON_ARTIFACT && a.name !== REPORT_JSON_ARTIFACT
  );
  return [...preferred, ...rest];
}

/** First artifact open by default; snapshot stays collapsed. */
export function artifactDefaultOpen(name: string, index: number): boolean {
  if (name === EVIDENCE_SNAPSHOT_ARTIFACT) return false;
  return index === 0;
}

import { Effect } from "effect";

import {
  parseJsonValue,
  REPORT_JSON_ARTIFACT,
  type JsonValue,
} from "@watchdog/schemas";

import { errorMessage } from "../infra/domain-error";
import { InvalidError } from "../infra/tagged-errors";

interface ArtifactRef {
  name: string;
  uri: string;
}

/** True if artifacts include canonical Cap report. */
export function artifactsHaveCapReport(artifacts: ArtifactRef[]): boolean {
  return artifacts.some((a) => a.name === REPORT_JSON_ARTIFACT);
}

interface CapReportLoadResult {
  report: JsonValue;
  name: string;
}

/**
 * Load Cap report JSON for pure interpret.
 * Requires canonical `report.json`.
 */
export function loadCapReportEffect(
  artifacts: ArtifactRef[],
  readArtifact: (uri: string) => Effect.Effect<Uint8Array, InvalidError>
): Effect.Effect<CapReportLoadResult | null, InvalidError> {
  return Effect.gen(function* loadCapReportGen() {
    const art = artifacts.find((a) => a.name === REPORT_JSON_ARTIFACT);
    if (!art) return null;
    const bytes = yield* readArtifact(art.uri);
    const text = new TextDecoder().decode(bytes);
    const report = yield* Effect.try({
      try: () => parseJsonValue(text),
      catch: (error) =>
        new InvalidError({
          reason: error instanceof Error ? error.message : errorMessage(error),
        }),
    });
    return { report, name: art.name };
  });
}

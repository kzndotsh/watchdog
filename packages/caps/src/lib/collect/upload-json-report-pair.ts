import { Effect } from "effect";

import type { CapArtifact } from "@watchdog/cap-sdk";
import { REPORT_JSON_ARTIFACT } from "@watchdog/schemas";
import type { ToolsTag } from "@watchdog/tools";

type UploadFn = (input: {
  bytes: Uint8Array;
  mime: string;
  name?: string;
}) => Effect.Effect<CapArtifact, ToolsTag>;

interface UploadJsonReportPairResult {
  report: CapArtifact;
  artifact: CapArtifact;
}

/** Upload report.json + a named JSON artifact with identical body (Collect Caps). */
export function uploadJsonReportPair(
  uploadArtifact: UploadFn,
  snap: unknown,
  namedArtifactName: string
): Effect.Effect<UploadJsonReportPairResult, ToolsTag> {
  return Effect.gen(function* uploadJsonReportPairGen() {
    const body = new TextEncoder().encode(JSON.stringify(snap, null, 2));
    const report = yield* uploadArtifact({
      bytes: body,
      mime: "application/json",
      name: REPORT_JSON_ARTIFACT,
    });
    const artifact = yield* uploadArtifact({
      bytes: body,
      mime: "application/json",
      name: namedArtifactName,
    });
    return { report, artifact };
  });
}

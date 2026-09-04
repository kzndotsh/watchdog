import { Effect } from "effect";

import {
  processExtractDraftSchema,
  type EvidenceSnapshot,
  type ProcessExtractDraft,
} from "@watchdog/ai";
import type {
  CapArtifact,
  CapInterpretOpts,
  CapInterpretResult,
} from "@watchdog/cap-sdk";
import {
  DERIVED_JSON_ARTIFACT,
  EVIDENCE_SNAPSHOT_ARTIFACT,
  REPORT_JSON_ARTIFACT,
} from "@watchdog/schemas";
import type { ToolsTag } from "@watchdog/tools";

import { draftToOutcome } from "./draft-to-patch-ops";

type UploadFn = (input: {
  bytes: Uint8Array;
  mime: string;
  name?: string;
}) => Effect.Effect<CapArtifact, ToolsTag>;

/** Upload snapshot + report.json + derived.json for any Process Cap run. */
export function uploadProcessArtifacts(
  uploadArtifact: UploadFn,
  snapshot: EvidenceSnapshot,
  draft: ProcessExtractDraft
): Effect.Effect<CapArtifact[], ToolsTag> {
  return Effect.gen(function* uploadProcessArtifactsGen() {
    const snapshotArt = yield* uploadArtifact({
      bytes: new TextEncoder().encode(JSON.stringify(snapshot, null, 2)),
      mime: "application/json",
      name: EVIDENCE_SNAPSHOT_ARTIFACT,
    });
    const reportArt = yield* uploadArtifact({
      bytes: new TextEncoder().encode(JSON.stringify(draft, null, 2)),
      mime: "application/json",
      name: REPORT_JSON_ARTIFACT,
    });
    const derivedArt = yield* uploadArtifact({
      bytes: new TextEncoder().encode(
        JSON.stringify({ identifiers: draft.identifiers }, null, 2)
      ),
      mime: "application/json",
      name: DERIVED_JSON_ARTIFACT,
    });
    return [snapshotArt, reportArt, derivedArt];
  });
}

export interface ProcessEmptySummaries {
  noEntity: string;
  empty: string;
}

interface ProcessInterpretInput {
  evidenceId: string;
  entityId?: string;
}

/** Pure interpret — report is ProcessExtractDraft JSON from run. */
export function interpretProcessDraft(
  report: unknown,
  opts: CapInterpretOpts<ProcessInterpretInput>,
  empty: ProcessEmptySummaries
): CapInterpretResult {
  const parsed = processExtractDraftSchema.safeParse(report);
  if (!parsed.success) {
    throw new Error(`Invalid ProcessExtractDraft: ${parsed.error.message}`);
  }
  const entityId = opts.input.entityId ?? opts.snapshotEntityId;
  const outcome = draftToOutcome(parsed.data, {
    evidenceId: opts.input.evidenceId,
    ...(entityId !== undefined && entityId !== "" ? { entityId } : {}),
  });
  switch (outcome.kind) {
    case "empty": {
      if (outcome.reason === "no_entity") {
        return {
          patch: [],
          summary: empty.noEntity,
          markSourceProcessed: false,
        };
      }
      // No signal: mark done only when there was text to harvest. Empty URL
      // dumps stay Processable after Enrich fills enriched.md.
      const hadText = (opts.snapshotTextChars ?? 0) > 0;
      return {
        patch: [],
        summary: empty.empty,
        markSourceProcessed: hadText,
      };
    }
    case "proposal": {
      return {
        patch: outcome.patch,
        summary: outcome.summary,
        markSourceProcessed: true,
      };
    }
    case "failed": {
      throw new Error(outcome.error);
    }
    default: {
      const _exhaustive: never = outcome;
      return _exhaustive;
    }
  }
}

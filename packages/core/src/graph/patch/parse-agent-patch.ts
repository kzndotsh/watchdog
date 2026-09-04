import { Effect, Result } from "effect";
import { assertPatchShape } from "@watchdog/policy";
import { trimmedOrNull, type PatchOp } from "@watchdog/schemas";

import { tryParsePatch } from "./patch";

export interface ParsedAgentPatch {
  ok: true;
  patch: PatchOp[];
  summary: string | null;
  evidenceIds: string[];
}

export interface AgentPatchRefusal {
  ok: false;
  error: string;
}

/** Write-only rules (userOverride, forced unverified) live at the call site. */
export function parseAgentPatchEffect(input: {
  patch: unknown;
  summary?: string;
  evidenceIds?: string[];
}): Effect.Effect<ParsedAgentPatch | AgentPatchRefusal> {
  return Effect.gen(function* parseAgentPatchGen() {
    const parsed = tryParsePatch(input.patch);
    if (!parsed.ok) {
      return { ok: false, error: parsed.error };
    }

    const shaped = yield* Effect.result(assertPatchShape(parsed.patch));
    if (Result.isFailure(shaped)) {
      return { ok: false, error: shaped.failure.reason };
    }

    if (parsed.patch.length === 0) {
      return { ok: false, error: "patch must not be empty" };
    }

    return {
      ok: true,
      patch: parsed.patch,
      summary: trimmedOrNull(input.summary),
      evidenceIds: [...new Set(input.evidenceIds)],
    };
  });
}

import type { PatchOp } from "@watchdog/schemas/graph";
import { parseGraphUuidList, trimmedOrNull } from "@watchdog/schemas/shared";

export type ParsedAgentPatch = {
  ok: true;
  patch: PatchOp[];
  summary: string | null;
  evidenceIds: string[];
};

export type AgentPatchRefusal = {
  ok: false;
  error: string;
};

/**
 * An agent's Proposal or graph write: the ops are already typed (the API input parses them
 * with the patch op schema); this refuses an empty patch and normalizes the summary and the
 * shared Evidence ids. Write-only rules (userOverride, forced unverified) live at the call site.
 */
export function parseAgentPatch(input: {
  patch: PatchOp[];
  summary?: string;
  evidenceIds?: string[];
}): ParsedAgentPatch | AgentPatchRefusal {
  if (input.patch.length === 0) {
    return { ok: false, error: "patch must not be empty" };
  }
  const evidenceIds = parseGraphUuidList(input.evidenceIds ?? []);
  if (evidenceIds === null) {
    return { ok: false, error: "evidenceIds contains an invalid UUID" };
  }
  return {
    ok: true,
    patch: input.patch,
    summary: trimmedOrNull(input.summary),
    evidenceIds,
  };
}

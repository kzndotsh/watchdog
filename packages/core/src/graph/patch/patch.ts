import { patchSchema, type PatchOp } from "@watchdog/schemas/graph";

export function parsePatch(raw: unknown): PatchOp[] {
  return patchSchema.parse(raw);
}

export function tryParsePatch(
  raw: unknown
): { ok: true; patch: PatchOp[] } | { ok: false; error: string } {
  const result = patchSchema.safeParse(raw);
  if (!result.success) {
    return { ok: false, error: result.error.message };
  }
  return { ok: true, patch: result.data };
}

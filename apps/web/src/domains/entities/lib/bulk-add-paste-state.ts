import {
  IDENTIFIER_PASTE_TARGET_LABELS,
  IDENTIFIER_PASTE_TARGETS,
  identifierPasteRowKey,
  type IdentifierPasteRow,
  type IdentifierPasteRowOverride,
  type IdentifierPasteTarget,
} from "@/domains/entities/lib/parse-identifier-paste";
import { normalizeIdentifierPlatform } from "@watchdog/schemas/shared";

export type BulkAddIdentifiersStage = "paste" | "map";

export function parsePasteTarget(value: string): IdentifierPasteTarget | null {
  return IDENTIFIER_PASTE_TARGETS.find((target) => target === value) ?? null;
}

export function mappingOptions(lockEntity: boolean) {
  const options: {
    value: IdentifierPasteTarget;
    label: string;
  }[] = [];
  for (const target of IDENTIFIER_PASTE_TARGETS) {
    if (lockEntity && target === "entity") continue;
    options.push({
      value: target,
      label: IDENTIFIER_PASTE_TARGET_LABELS[target],
    });
  }
  return options;
}

export function effectiveMapping(
  mapping: readonly IdentifierPasteTarget[],
  lockEntity: boolean
): readonly IdentifierPasteTarget[] {
  if (!lockEntity) return mapping;
  return mapping.map((target) => (target === "entity" ? "skip" : target));
}

export function overlayServerErrors(
  rows: IdentifierPasteRow[],
  serverErrors: ReadonlyMap<string, string>
): IdentifierPasteRow[] {
  return rows.map((row) => {
    if (row.error !== null) return row;
    const extra = serverErrors.get(identifierPasteRowKey(row));
    if (extra === undefined) return row;
    return { ...row, error: extra };
  });
}

function entityIdOverrideChanged(
  value: string,
  base: IdentifierPasteRow | undefined
): boolean {
  return value !== (base?.entityId ?? "");
}

function typeOverrideChanged(
  value: NonNullable<IdentifierPasteRowOverride["type"]>,
  base: IdentifierPasteRow | undefined
): boolean {
  return value !== (base?.type ?? null);
}

function valueOverrideChanged(
  value: string,
  base: IdentifierPasteRow | undefined
): boolean {
  return value !== (base?.value ?? "");
}

function platformOverrideChanged(
  value: string,
  base: IdentifierPasteRow | undefined
): boolean {
  return normalizeIdentifierPlatform(value) !== (base?.platform ?? "");
}

function statusOverrideChanged(
  value: NonNullable<IdentifierPasteRowOverride["status"]>,
  base: IdentifierPasteRow | undefined
): boolean {
  return value !== base?.status;
}

function confidenceOverrideChanged(
  value: NonNullable<IdentifierPasteRowOverride["confidence"]>,
  base: IdentifierPasteRow | undefined
): boolean {
  return value !== base?.confidence;
}

function applyOverrideField<K extends keyof IdentifierPasteRowOverride>(
  next: IdentifierPasteRowOverride,
  key: K,
  merged: IdentifierPasteRowOverride,
  base: IdentifierPasteRow | undefined,
  changed: (
    value: NonNullable<IdentifierPasteRowOverride[K]>,
    baseRow: IdentifierPasteRow | undefined
  ) => boolean
): void {
  const value = merged[key];
  if (value === undefined) return;
  if (changed(value, base)) {
    next[key] = value;
  }
}

export function mergeRowOverride(
  base: IdentifierPasteRow | undefined,
  current: IdentifierPasteRowOverride | undefined,
  patch: IdentifierPasteRowOverride
): IdentifierPasteRowOverride | null {
  const merged = { ...current, ...patch };
  const next: IdentifierPasteRowOverride = {};
  applyOverrideField(next, "entityId", merged, base, entityIdOverrideChanged);
  applyOverrideField(next, "type", merged, base, typeOverrideChanged);
  applyOverrideField(next, "value", merged, base, valueOverrideChanged);
  applyOverrideField(next, "platform", merged, base, platformOverrideChanged);
  applyOverrideField(next, "status", merged, base, statusOverrideChanged);
  applyOverrideField(
    next,
    "confidence",
    merged,
    base,
    confidenceOverrideChanged
  );
  return Object.keys(next).length === 0 ? null : next;
}

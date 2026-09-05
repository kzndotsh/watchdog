import { useMemo, useState } from "react";

import {
  IDENTIFIER_PASTE_TARGET_LABELS,
  IDENTIFIER_PASTE_TARGETS,
  applyIdentifierPasteRowOverrides,
  identifierPasteRowKey,
  isIdentifierPasteRowImportable,
  parseIdentifierPasteTable,
  resolveIdentifierPasteRows,
  type IdentifierPasteEntity,
  type IdentifierPasteRow,
  type IdentifierPasteRowOverride,
  type IdentifierPasteTarget,
} from "@/domains/entities/lib/parse-identifier-paste";
import type { EntityOption } from "@/shared/ui/entity-combobox";
import { normalizeIdentifierPlatform } from "@watchdog/schemas";

export type BulkAddIdentifiersStage = "paste" | "map";

export function parsePasteTarget(value: string): IdentifierPasteTarget | null {
  return IDENTIFIER_PASTE_TARGETS.find((target) => target === value) ?? null;
}

function mappingOptions(lockEntity: boolean) {
  return IDENTIFIER_PASTE_TARGETS.filter(
    (target) => !lockEntity || target !== "entity"
  ).map((target) => ({
    value: target,
    label: IDENTIFIER_PASTE_TARGET_LABELS[target],
  }));
}

function effectiveMapping(
  mapping: readonly IdentifierPasteTarget[],
  lockEntity: boolean
): readonly IdentifierPasteTarget[] {
  if (!lockEntity) return mapping;
  return mapping.map((target) => (target === "entity" ? "skip" : target));
}

function overlayServerErrors(
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

function mergeRowOverride(
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

export function useBulkAddIdentifiersPaste({
  entities,
  lockEntity = null,
}: {
  entities: readonly EntityOption[];
  lockEntity?: IdentifierPasteEntity | null;
}) {
  const [stage, setStage] = useState<BulkAddIdentifiersStage>("paste");
  const [paste, setPaste] = useState("");
  const [userMapping, setUserMapping] = useState<
    IdentifierPasteTarget[] | null
  >(null);
  const [defaultEntityId, setDefaultEntityId] = useState(lockEntity?.id ?? "");
  const [defaultPlatform, setDefaultPlatform] = useState("");
  const [rowOverrides, setRowOverrides] = useState<
    Map<string, IdentifierPasteRowOverride>
  >(() => new Map());
  const [serverErrors, setServerErrors] = useState<Map<string, string>>(
    () => new Map()
  );

  function resetForm() {
    setStage("paste");
    setPaste("");
    setUserMapping(null);
    setDefaultEntityId(lockEntity?.id ?? "");
    setDefaultPlatform("");
    setRowOverrides(new Map());
    setServerErrors(new Map());
  }

  function clearPasteDerivedState() {
    setUserMapping(null);
    setRowOverrides(new Map());
    setServerErrors(new Map());
  }

  function setPasteText(next: string) {
    setPaste(next);
    clearPasteDerivedState();
  }

  const table = useMemo(() => parseIdentifierPasteTable(paste), [paste]);
  const mapping = useMemo(() => {
    const suggested = table.suggestedMapping;
    const base =
      userMapping !== null && userMapping.length === suggested.length
        ? userMapping
        : suggested;
    return effectiveMapping(base, lockEntity !== null);
  }, [table.suggestedMapping, userMapping, lockEntity]);

  const entityOptions: EntityOption[] = useMemo(
    () =>
      entities.map((e) => ({
        id: e.id,
        name: e.name,
        kind: e.kind,
        slug: e.slug,
      })),
    [entities]
  );

  const pasteEntities: IdentifierPasteEntity[] = useMemo(
    () =>
      entities.map((e) => ({
        id: e.id,
        name: e.name,
        slug: e.slug ?? "",
      })),
    [entities]
  );

  const baseRows = useMemo(
    () =>
      resolveIdentifierPasteRows({
        table,
        mapping,
        defaults: {
          entityId: lockEntity?.id ?? defaultEntityId,
          type: null,
          platform: defaultPlatform,
        },
        entities: pasteEntities,
        lockEntity,
      }),
    [
      table,
      mapping,
      lockEntity,
      defaultEntityId,
      defaultPlatform,
      pasteEntities,
    ]
  );

  const rows = useMemo(
    () =>
      overlayServerErrors(
        applyIdentifierPasteRowOverrides(baseRows, rowOverrides, pasteEntities),
        serverErrors
      ),
    [baseRows, rowOverrides, pasteEntities, serverErrors]
  );

  function setRowPatch(
    row: IdentifierPasteRow,
    patch: IdentifierPasteRowOverride
  ) {
    const key = identifierPasteRowKey(row);
    const base = baseRows.find((r) => identifierPasteRowKey(r) === key);
    setRowOverrides((prev) => {
      const next = new Map(prev);
      const merged = mergeRowOverride(base, prev.get(key), patch);
      if (merged === null) next.delete(key);
      else next.set(key, merged);
      return next;
    });
  }

  function setColumnMapping(index: number, target: IdentifierPasteTarget) {
    setUserMapping((prev) => {
      const base =
        prev !== null && prev.length === mapping.length ? prev : mapping;
      const next = [...base];
      next[index] = target;
      return next;
    });
  }

  function retainFailedImport(args: {
    paste: string;
    serverErrors: Map<string, string>;
  }) {
    setPaste(args.paste);
    setRowOverrides(new Map());
    setServerErrors(args.serverErrors);
  }

  const validRows = rows.filter(isIdentifierPasteRowImportable);
  const showPlatform =
    mapping.includes("handle") || rows.some((row) => row.type === "handle");
  const fieldOptions = mappingOptions(lockEntity !== null);
  const canContinue = table.columnLabels.length > 0;

  return {
    stage,
    setStage,
    paste,
    setPasteText,
    table,
    mapping,
    rows,
    validRows,
    showPlatform,
    canContinue,
    entityOptions,
    defaultEntityId,
    setDefaultEntityId,
    defaultPlatform,
    setDefaultPlatform,
    fieldOptions,
    setColumnMapping,
    setRowPatch,
    resetForm,
    retainFailedImport,
  };
}

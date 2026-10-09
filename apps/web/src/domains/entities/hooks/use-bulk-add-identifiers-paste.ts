import { useMemo, useState } from "react";

import {
  effectiveMapping,
  mappingOptions,
  mergeRowOverride,
  overlayServerErrors,
  type BulkAddIdentifiersStage,
} from "@/domains/entities/lib/bulk-add-paste-state";
import {
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

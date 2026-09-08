import {
  entityDisplayLabel,
  normalizeIdentifierPlatform,
  parseOptionalTrimmedUuid,
  validateIdentifierWrite,
  type IdentifierType,
} from "@watchdog/schemas";

import { cleanPasteCell, inferPasteIdentity } from "./infer-paste-identity";
import {
  cellForTarget,
  matchPasteEntity,
  valueTargets,
} from "./match-paste-entity";
import {
  parsePasteConfidenceToken,
  parsePasteStatusToken,
  parsePasteTypeToken,
  type IdentifierPasteDefaults,
  type IdentifierPasteEntity,
  type IdentifierPasteRow,
  type IdentifierPasteRowOverride,
  type IdentifierPasteTable,
  type IdentifierPasteTarget,
} from "./parse-identifier-paste.types";

const TYPE_UNINFERRED = "Type could not be inferred";

function applyValidatedWrite(
  type: IdentifierType,
  value: string,
  platform: string
): { value: string; platform: string; error: string | null } {
  const written = validateIdentifierWrite({ type, value, platform });
  if (!written.ok) {
    return {
      value,
      platform: normalizeIdentifierPlatform(platform),
      error: written.message,
    };
  }
  return {
    value: written.value,
    platform: written.platform,
    error: null,
  };
}

function firstError(parts: (string | null)[]): string | null {
  for (const part of parts) {
    if (part !== null && part !== "") return part;
  }
  return null;
}

export function isIdentifierPasteRowImportable(
  row: IdentifierPasteRow
): boolean {
  return (
    row.error === null &&
    row.entityId !== null &&
    row.type !== null &&
    row.value !== ""
  );
}

export function identifierPasteRowKey(row: {
  sourceIndex: number;
  columnIndex: number;
}): string {
  return `${String(row.sourceIndex)}\0${String(row.columnIndex)}`;
}

function identifierPasteDedupKey(row: IdentifierPasteRow): string | null {
  if (row.entityId === null || row.type === null || row.value === "") {
    return null;
  }
  return `${row.entityId}\0${row.type}\0${row.platform}\0${row.value}`;
}

function resolveShared(opts: {
  row: readonly string[];
  mapping: readonly IdentifierPasteTarget[];
  defaults: IdentifierPasteDefaults;
  entities: readonly IdentifierPasteEntity[];
  lockEntity?: IdentifierPasteEntity | null;
}): {
  entityId: string | null;
  entityName: string | null;
  entityError: string | null;
  typeFromColumn: IdentifierType | null;
  typeError: string | null;
  platformFromColumn: string;
  status: IdentifierPasteRow["status"];
  statusError: string | null;
  confidence: IdentifierPasteRow["confidence"];
  confidenceError: string | null;
  note: string | null;
} {
  const { row, mapping, defaults, entities, lockEntity } = opts;
  const rawType = cellForTarget(row, mapping, "type");
  const rawPlatform = cellForTarget(row, mapping, "platform");
  const rawStatus = cellForTarget(row, mapping, "status");
  const rawConfidence = cellForTarget(row, mapping, "confidence");
  const rawEntity = cellForTarget(row, mapping, "entity");

  let typeFromColumn: IdentifierType | null = null;
  let typeError: string | null = null;
  if (rawType !== "") {
    const parsed = parsePasteTypeToken(rawType);
    if (parsed === null) typeError = "Unknown type";
    else typeFromColumn = parsed;
  }

  let entityId: string | null = null;
  let entityName: string | null = null;
  let entityError: string | null = null;
  if (lockEntity) {
    entityId = lockEntity.id;
    entityName = entityDisplayLabel({
      name: lockEntity.name,
      slug: lockEntity.slug,
    });
  } else {
    const matched = matchPasteEntity(rawEntity, entities, defaults.entityId);
    if ("error" in matched) entityError = matched.error;
    else {
      entityId = matched.id;
      entityName = entityDisplayLabel({
        name: matched.name,
        slug: matched.slug,
      });
    }
  }

  let status: IdentifierPasteRow["status"] = "unknown";
  let statusError: string | null = null;
  if (rawStatus !== "") {
    const parsed = parsePasteStatusToken(rawStatus);
    if (parsed === null) statusError = "Unknown status";
    else status = parsed;
  }

  let confidence: IdentifierPasteRow["confidence"] = "unverified";
  let note: string | null = null;
  let confidenceError: string | null = null;
  if (rawConfidence !== "") {
    const parsed = parsePasteConfidenceToken(rawConfidence);
    if (parsed === null) confidenceError = "Unknown confidence";
    else if (parsed === "confirmed") {
      confidence = "unverified";
      note = "confirmed → unverified (no evidence)";
    } else {
      confidence = parsed;
    }
  }

  return {
    entityId,
    entityName,
    entityError,
    typeFromColumn,
    typeError,
    platformFromColumn: rawPlatform,
    status,
    statusError,
    confidence,
    confidenceError,
    note,
  };
}

function dedupIdentifierPasteRows(
  rows: IdentifierPasteRow[]
): IdentifierPasteRow[] {
  const seen = new Set<string>();
  return rows.map((row) => {
    const base =
      row.error === "Duplicate of an earlier row"
        ? { ...row, error: null }
        : row;
    const key = identifierPasteDedupKey(base);
    if (key === null || base.error !== null) return base;
    if (seen.has(key)) {
      return { ...base, error: "Duplicate of an earlier row" };
    }
    seen.add(key);
    return base;
  });
}

export function resolveIdentifierPasteRows(opts: {
  table: IdentifierPasteTable;
  mapping: readonly IdentifierPasteTarget[];
  defaults: IdentifierPasteDefaults;
  entities: readonly IdentifierPasteEntity[];
  lockEntity?: IdentifierPasteEntity | null;
}): IdentifierPasteRow[] {
  const { table, mapping, defaults, entities, lockEntity } = opts;
  const targets = valueTargets(mapping);
  const rows: IdentifierPasteRow[] = [];

  for (const [sourceIndex, row] of table.cells.entries()) {
    const shared = resolveShared({
      row,
      mapping,
      defaults,
      entities,
      lockEntity,
    });
    const sourceLine = table.dataLines[sourceIndex] ?? "";
    const cols =
      targets.length === 0
        ? [{ index: -1, pinned: null as IdentifierType | null }]
        : targets;

    for (const col of cols) {
      const rawValue = col.index === -1 ? "" : (row[col.index] ?? "");
      const inferred = inferPasteIdentity(rawValue);
      if (inferred.value === "" && targets.length > 1) continue;

      const type =
        col.pinned ?? inferred.type ?? shared.typeFromColumn ?? defaults.type;
      const typeError =
        type === null
          ? (shared.typeError ?? TYPE_UNINFERRED)
          : shared.typeError;

      const valueCore =
        col.pinned === null || col.pinned === inferred.type
          ? inferred.value
          : cleanPasteCell(rawValue);

      const headerPlatform =
        col.index >= 0 ? (table.suggestedPlatforms[col.index] ?? "") : "";
      let platformRaw = defaults.platform ?? "";
      if (shared.platformFromColumn !== "") {
        platformRaw = shared.platformFromColumn;
      } else if (headerPlatform !== "") {
        platformRaw = headerPlatform;
      } else if (inferred.platform !== null && inferred.platform !== "") {
        platformRaw = inferred.platform;
      }

      let value = valueCore;
      let platform = normalizeIdentifierPlatform(platformRaw);
      let valueError: string | null =
        type === null && valueCore === "" ? "Value is required." : null;
      if (type !== null) {
        const applied = applyValidatedWrite(type, valueCore, platformRaw);
        value = applied.value;
        platform = applied.platform;
        valueError = applied.error;
      }

      rows.push({
        sourceIndex,
        columnIndex: col.index,
        sourceLine,
        entityId: shared.entityId,
        entityName: shared.entityName,
        entityError: shared.entityError,
        type,
        value,
        platform,
        status: shared.status,
        confidence: shared.confidence,
        error: firstError([
          valueError,
          typeError,
          shared.entityError,
          shared.statusError,
          shared.confidenceError,
        ]),
        note: shared.note,
      });
    }
  }

  return dedupIdentifierPasteRows(rows);
}

function rowFieldError(row: IdentifierPasteRow): string | null {
  let writeError: string | null = null;
  if (row.type === null) {
    if (row.value === "") writeError = "Value is required.";
  } else {
    writeError = applyValidatedWrite(row.type, row.value, row.platform).error;
  }
  return firstError([
    writeError,
    row.type === null ? TYPE_UNINFERRED : null,
    row.entityId === null ? (row.entityError ?? "Entity is required") : null,
  ]);
}

function applyRowOverride(
  row: IdentifierPasteRow,
  patch: IdentifierPasteRowOverride,
  entities: readonly IdentifierPasteEntity[]
): IdentifierPasteRow {
  let entityId = row.entityId;
  let entityName = row.entityName;
  let entityError = row.entityError;
  if (patch.entityId !== undefined) {
    const scopedEntityId = parseOptionalTrimmedUuid(patch.entityId);
    if (scopedEntityId === undefined) {
      entityId = null;
      entityName = null;
      entityError = "Entity is required";
    } else {
      const entity = entities.find((e) => e.id === scopedEntityId);
      if (entity !== undefined) {
        entityId = entity.id;
        entityName = entityDisplayLabel({
          name: entity.name,
          slug: entity.slug,
        });
        entityError = null;
      }
    }
  }

  const type = patch.type === undefined ? row.type : patch.type;
  const platformRaw = patch.platform ?? row.platform;
  let value = patch.value ?? row.value;
  let platform = normalizeIdentifierPlatform(platformRaw);
  if (type !== null) {
    const applied = applyValidatedWrite(type, value, platformRaw);
    value = applied.value;
    platform = applied.platform;
  }
  const status = patch.status ?? row.status;

  let confidence = row.confidence;
  let note = row.note;
  if (patch.confidence !== undefined) {
    if (patch.confidence === "confirmed") {
      confidence = "unverified";
      note = "confirmed → unverified (no evidence)";
    } else {
      confidence = patch.confidence;
      note = null;
    }
  }

  const next = {
    ...row,
    entityId,
    entityName,
    entityError,
    type,
    value,
    platform,
    status,
    confidence,
    note,
  };
  return { ...next, error: rowFieldError(next) };
}

export function applyIdentifierPasteRowOverrides(
  rows: readonly IdentifierPasteRow[],
  overrides: ReadonlyMap<string, IdentifierPasteRowOverride>,
  entities: readonly IdentifierPasteEntity[]
): IdentifierPasteRow[] {
  if (overrides.size === 0) return [...rows];
  const next = rows.map((row) => {
    const patch = overrides.get(identifierPasteRowKey(row));
    if (patch === undefined) return row;
    return applyRowOverride(row, patch, entities);
  });
  return dedupIdentifierPasteRows(next);
}

export function rebuildIdentifierPaste(opts: {
  table: IdentifierPasteTable;
  keepSourceIndices: readonly number[];
}): string {
  const keep = new Set(opts.keepSourceIndices);
  const lines: string[] = [];
  if (opts.table.headerLine !== null) lines.push(opts.table.headerLine);
  for (const [i, line] of opts.table.dataLines.entries()) {
    if (keep.has(i)) lines.push(line);
  }
  return lines.join("\n");
}

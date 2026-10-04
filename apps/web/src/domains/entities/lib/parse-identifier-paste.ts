import {
  resolveIdentifierPlatform,
  type IdentifierType,
} from "@watchdog/schemas/shared";

import { cleanPasteCell, inferPasteIdentity } from "./infer-paste-identity";
import {
  FIELD_ALIASES,
  PASTE_ROW_CAP,
  TYPE_BY_TOKEN,
  TYPE_HEADER_ALIASES,
  UNIQUE_TARGETS,
  type IdentifierPasteTable,
  type IdentifierPasteTarget,
  type PasteDelimiter,
} from "./parse-identifier-paste.types";

export {
  IDENTIFIER_PASTE_TARGET_LABELS,
  IDENTIFIER_PASTE_TARGETS,
  PASTE_ROW_CAP,
  type IdentifierPasteDefaults,
  type IdentifierPasteEntity,
  type IdentifierPasteRow,
  type IdentifierPasteRowOverride,
  type IdentifierPasteTable,
  type IdentifierPasteTarget,
} from "./parse-identifier-paste.types";
export {
  applyIdentifierPasteRowOverrides,
  identifierPasteRowKey,
  isIdentifierPasteRowImportable,
  rebuildIdentifierPaste,
  resolveIdentifierPasteRows,
} from "./resolve-identifier-paste";

function normalizeHeader(cell: string): string {
  return cell
    .trim()
    .toLowerCase()
    .replaceAll(/[\s_-]+/g, "");
}

function headerHint(cell: string): {
  target: IdentifierPasteTarget;
  platform: string | null;
} | null {
  const key = normalizeHeader(cell);
  if (key === "") return null;
  const field = FIELD_ALIASES[key];
  if (field !== undefined) return { target: field, platform: null };
  const type = TYPE_BY_TOKEN.get(key) ?? TYPE_HEADER_ALIASES[key];
  if (type !== undefined) return { target: type, platform: null };
  const platform = resolveIdentifierPlatform(cell);
  if (platform !== null && platform !== "") {
    return { target: "handle", platform };
  }
  return null;
}

function splitLines(text: string): string[] {
  return text.split("\n");
}

function detectDelimiter(lines: readonly string[]): PasteDelimiter {
  const blob = lines.join("\n");
  if (blob.includes("\t")) return "tab";
  if (blob.includes(",")) return "comma";
  if (blob.includes(";")) return "semicolon";
  if (blob.includes("|")) return "pipe";
  return "none";
}

function delimiterChar(delimiter: PasteDelimiter): string | null {
  switch (delimiter) {
    case "tab": {
      return "\t";
    }
    case "comma": {
      return ",";
    }
    case "semicolon": {
      return ";";
    }
    case "pipe": {
      return "|";
    }
    case "none": {
      return null;
    }
    default: {
      const _exhaustive: never = delimiter;
      return _exhaustive;
    }
  }
}

/** RFC-style quoted fields; delimiter is a single character. */
export function splitDelimitedLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function splitRow(line: string, delimiter: PasteDelimiter): string[] {
  const ch = delimiterChar(delimiter);
  if (ch === null) return [line.trim()];
  return splitDelimitedLine(line, ch);
}

function normalizePasteText(text: string): string {
  return text
    .replace(/^\uFEFF/, "")
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .replaceAll("\u00A0", " ")
    .replaceAll(/[\u200B-\u200D\uFEFF]/g, "")
    .replaceAll(/[\u201C\u201D]/g, '"')
    .replaceAll(/[\u2018\u2019]/g, "'");
}

function stripLineChrome(line: string): string {
  return line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "");
}

function inferColumnTarget(samples: readonly string[]): {
  target: IdentifierPasteTarget;
  platform: string | null;
} {
  const inferred = samples
    .map((sample) => inferPasteIdentity(sample))
    .filter(
      (item): item is typeof item & { type: IdentifierType } =>
        item.type !== null
    );
  const first = inferred[0];
  if (first === undefined) return { target: "skip", platform: null };
  if (!inferred.every((item) => item.type === first.type)) {
    return { target: "value", platform: null };
  }
  const platforms = inferred
    .map((item) => item.platform)
    .filter((p): p is string => p !== null && p !== "");
  const platform = platforms[0];
  if (platform === undefined || !platforms.every((p) => p === platform)) {
    return { target: first.type, platform: null };
  }
  return { target: first.type, platform };
}

function suggestMapping(opts: {
  headers: string[] | null;
  columnCount: number;
  cells: string[][];
}): {
  mapping: IdentifierPasteTarget[];
  platforms: (string | null)[];
} {
  const { headers, columnCount, cells } = opts;
  const platforms: (string | null)[] = Array.from(
    { length: columnCount },
    () => null
  );
  if (headers === null) {
    const mapping = Array.from({ length: columnCount }, (_, i) => {
      const samples = cells
        .map((row) => row[i] ?? "")
        .filter((cell) => cell !== "");
      const inferred = inferColumnTarget(samples);
      if (inferred.platform !== null) platforms[i] = inferred.platform;
      if (inferred.target !== "skip") return inferred.target;
      return columnCount === 1 ? "value" : "skip";
    });
    return { mapping, platforms };
  }

  const used = new Set<IdentifierPasteTarget>();
  const mapping = headers.map((header, i) => {
    const hint = headerHint(header);
    if (hint === null) return "skip";
    if (hint.platform !== null) platforms[i] = hint.platform;
    if (UNIQUE_TARGETS.has(hint.target) && used.has(hint.target)) {
      return "skip";
    }
    if (UNIQUE_TARGETS.has(hint.target)) used.add(hint.target);
    return hint.target;
  });
  return { mapping, platforms };
}

function looksLikeHeader(cells: readonly string[]): boolean {
  const nonempty = cells.filter((c) => c !== "");
  if (nonempty.length === 0) return false;
  return nonempty.every((c) => headerHint(c) !== null);
}

function emptyTable(): IdentifierPasteTable {
  return {
    delimiter: "none",
    hasHeader: false,
    headerLine: null,
    columnLabels: [],
    suggestedMapping: [],
    suggestedPlatforms: [],
    dataLines: [],
    cells: [],
    truncated: false,
    rawDataCount: 0,
  };
}

function tableFromGrid(opts: {
  delimiter: PasteDelimiter;
  headers: string[] | null;
  headerLine: string | null;
  dataLines: string[];
  cells: string[][];
}): IdentifierPasteTable {
  const rawDataCount = opts.dataLines.length;
  const truncated = rawDataCount > PASTE_ROW_CAP;
  const dataLines = truncated
    ? opts.dataLines.slice(0, PASTE_ROW_CAP)
    : opts.dataLines;
  const cells = truncated ? opts.cells.slice(0, PASTE_ROW_CAP) : opts.cells;
  const columnCount = Math.max(
    opts.headers?.length ?? 0,
    ...cells.map((row) => row.length),
    0
  );
  const headers =
    opts.headers === null
      ? null
      : Array.from({ length: columnCount }, (_, i) => opts.headers?.[i] ?? "");
  const columnLabels =
    headers ?? Array.from({ length: columnCount }, (_, i) => `Column ${i + 1}`);
  const suggested = suggestMapping({ headers, columnCount, cells });
  return {
    delimiter: opts.delimiter,
    hasHeader: headers !== null,
    headerLine: opts.headerLine,
    columnLabels,
    suggestedMapping: suggested.mapping,
    suggestedPlatforms: suggested.platforms,
    dataLines,
    cells,
    truncated,
    rawDataCount,
  };
}

function recordsToTable(
  records: Record<string, string>[]
): IdentifierPasteTable {
  const headers: string[] = [];
  for (const record of records) {
    for (const key of Object.keys(record)) {
      if (!headers.includes(key)) headers.push(key);
    }
  }
  const cells = records.map((record) =>
    headers.map((header) => record[header] ?? "")
  );
  return tableFromGrid({
    delimiter: "comma",
    headers,
    headerLine: headers.join(","),
    dataLines: cells.map((row) => row.join(",")),
    cells,
  });
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function tryParseJsonPaste(text: string): IdentifierPasteTable | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("[") && !trimmed.startsWith("{")) return null;
  let data: unknown;
  try {
    data = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (typeof data === "string") {
    return tableFromGrid({
      delimiter: "none",
      headers: null,
      headerLine: null,
      dataLines: [data],
      cells: [[data]],
    });
  }
  if (Array.isArray(data) && data.every((item) => typeof item === "string")) {
    const cells = data.map((value) => [value]);
    return tableFromGrid({
      delimiter: "none",
      headers: null,
      headerLine: null,
      dataLines: data,
      cells,
    });
  }
  let records: Record<string, unknown>[] = [];
  if (Array.isArray(data)) {
    records = data.filter(isJsonRecord);
    if (records.length !== data.length) return null;
  } else if (isJsonRecord(data)) {
    records = [data];
  }
  if (records.length === 0) return null;
  return recordsToTable(
    records.map((record) => {
      const row: Record<string, string> = {};
      for (const [key, value] of Object.entries(record)) {
        if (value === null || value === undefined) row[key] = "";
        else
          row[key] = typeof value === "string" ? value : JSON.stringify(value);
      }
      return row;
    })
  );
}

const LABEL_LINE = /^([^:\n]{1,40})\s*:\s+(.+)$/;

interface LabeledField {
  label: string;
  value: string;
}

function parseLabeledPasteLine(trimmed: string): LabeledField | "invalid" {
  const match = LABEL_LINE.exec(trimmed);
  if (match === null) return "invalid";
  const label = match[1]?.trim() ?? "";
  const value = match[2]?.trim() ?? "";
  if (headerHint(label) === null) return "invalid";
  return { label, value };
}

function pushLabeledRecord(
  records: Record<string, string>[],
  current: Record<string, string> | null
): Record<string, string> | null {
  if (current !== null && Object.keys(current).length > 0) {
    records.push(current);
  }
  return null;
}

function tryParseLabeledPaste(
  lines: readonly string[]
): IdentifierPasteTable | null {
  const records: Record<string, string>[] = [];
  let current: Record<string, string> | null = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") {
      current = pushLabeledRecord(records, current);
      continue;
    }
    const parsed = parseLabeledPasteLine(trimmed);
    if (parsed === "invalid") return null;
    current ??= {};
    current[parsed.label] = parsed.value;
  }
  pushLabeledRecord(records, current);
  if (records.length === 0) return null;
  return recordsToTable(records);
}

function isMarkdownSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)+\|?\s*$/.test(line);
}

function splitMarkdownRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((cell) => cell.trim());
}

function tryParseMarkdownTable(
  lines: readonly string[]
): IdentifierPasteTable | null {
  const tableLines = lines.filter((line) => line.includes("|"));
  if (tableLines.length < 2) return null;
  if (tableLines.length < lines.length * 0.8) return null;
  const body = tableLines.filter((line) => !isMarkdownSeparator(line));
  if (body.length === 0) return null;
  const rows = body.map((line) => splitMarkdownRow(line));
  const first = rows[0];
  if (first === undefined) return null;
  const hasHeader = looksLikeHeader(first);
  const headers = hasHeader ? first : null;
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const dataLines = hasHeader ? body.slice(1) : body;
  if (dataRows.length === 0) return null;
  return tableFromGrid({
    delimiter: "pipe",
    headers,
    headerLine: hasHeader ? (body[0] ?? null) : null,
    dataLines,
    cells: dataRows,
  });
}

function splitLooseIdentifierList(line: string): string[] {
  if (!/\s\/\s/.test(line)) return [line];
  const parts = line
    .split(/\s\/\s/)
    .map((part) => part.trim())
    .filter((part) => part !== "");
  if (parts.length < 2) return [line];
  if (parts.every((part) => inferPasteIdentity(part).type !== null)) {
    return parts;
  }
  return [line];
}

function splitPasteRow(line: string, delimiter: PasteDelimiter): string[] {
  return delimiter === "none"
    ? splitLooseIdentifierList(line)
    : splitRow(line, delimiter);
}

function parseDelimitedPaste(
  nonempty: readonly string[]
): IdentifierPasteTable {
  const delimiter = detectDelimiter(nonempty);
  const firstCells = splitPasteRow(nonempty[0] ?? "", delimiter);
  const hasHeader = looksLikeHeader(firstCells);
  const headerLine = hasHeader ? (nonempty[0] ?? null) : null;
  const dataSource = hasHeader ? nonempty.slice(1) : [...nonempty];
  const cells = dataSource.map((line) => splitPasteRow(line, delimiter));
  return tableFromGrid({
    delimiter,
    headers: hasHeader ? firstCells : null,
    headerLine,
    dataLines: dataSource,
    cells,
  });
}

export function parseIdentifierPasteTable(text: string): IdentifierPasteTable {
  const normalized = normalizePasteText(text);
  const jsonTable = tryParseJsonPaste(normalized);
  if (jsonTable !== null) return jsonTable;

  const rawLines = splitLines(normalized).map((line) => stripLineChrome(line));
  const labeled = tryParseLabeledPaste(rawLines);
  if (labeled !== null) return labeled;

  const nonempty = rawLines.filter((line) => line.trim() !== "");
  if (nonempty.length === 0) return emptyTable();

  const markdown = tryParseMarkdownTable(nonempty);
  if (markdown !== null) return markdown;

  return parseDelimitedPaste(nonempty);
}

export function identifierPasteColumnSamples(
  table: IdentifierPasteTable,
  columnIndex: number,
  limit = 3
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of table.cells) {
    const cell = cleanPasteCell(row[columnIndex] ?? "");
    if (cell === "" || seen.has(cell)) continue;
    seen.add(cell);
    out.push(cell);
    if (out.length >= limit) break;
  }
  return out;
}

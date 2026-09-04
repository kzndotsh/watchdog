import type { ArgsDef, CommandContext, CommandDef } from "citty";

function camelCase(input: string): string {
  return input.replaceAll(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

function kebabCase(input: string): string {
  return input
    .replaceAll(/([a-z])([A-Z])/g, "$1-$2")
    .replaceAll("_", "-")
    .toLowerCase();
}

/** Shared format / control flags — merge explicitly via `...formatArgs` on leaf args. */
export const formatArgs = {
  table: {
    type: "boolean" as const,
    description: "Human ASCII table (lists)",
    default: false,
  },
  full: {
    type: "boolean" as const,
    description: "Do not truncate long fields / include full rows",
    default: false,
  },
  raw: {
    type: "boolean" as const,
    description: "Bare path/URL on stdout (export, download)",
    default: false,
  },
  json: {
    type: "boolean" as const,
    description: "No-op (JSON is default)",
    default: false,
  },
} as const;

const MAX_HELP = 3;

function helpEnabled(): boolean {
  return process.env.WD_CLI_HELP !== "0";
}

function debugEnabled(): boolean {
  return process.env.WD_CLI_DEBUG === "1";
}

function limitHelpLines(help: string[] | undefined): string[] | undefined {
  if (!helpEnabled() || help === undefined || help.length === 0) {
    return undefined;
  }
  return help.slice(0, MAX_HELP);
}

export interface CliErrorBody {
  ok: false;
  error: { code: string; message: string; status?: number };
  help?: string[];
}

export interface CliListBody<T> {
  count: number;
  items: T[];
  help?: string[];
}

/** Thrown by `fail()` so wrappers can `process.exit` without racing stdout. */
export class CliExitError extends Error {
  readonly exitCode: number;

  constructor(exitCode: number) {
    super("CLI_EXIT");
    this.name = "CliExitError";
    this.exitCode = exitCode;
  }
}

/** Compact JSON to stdout (no pretty-print). */
export function emit(value: unknown): void {
  console.log(JSON.stringify(value));
}

function tableCell(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

function printTable(rows: Record<string, unknown>[], columns?: string[]): void {
  const first = rows[0];
  if (first === undefined) {
    console.log("count: 0");
    return;
  }
  const keys = columns ?? Object.keys(first);
  const widths = keys.map((k) =>
    Math.max(k.length, ...rows.map((r) => tableCell(r[k]).length))
  );
  console.log(keys.map((k, i) => k.padEnd(widths[i] ?? 0)).join("  "));
  console.log(widths.map((w) => "─".repeat(w)).join("──"));
  for (const row of rows) {
    console.log(
      keys.map((k, i) => tableCell(row[k]).padEnd(widths[i] ?? 0)).join("  ")
    );
  }
}

export function emitList(input: {
  items: Record<string, unknown>[];
  help?: string[];
  table?: boolean;
  columns?: string[];
}): void {
  const help = limitHelpLines(input.help);
  if (input.table === true) {
    printTable(input.items, input.columns);
    if (help !== undefined) {
      for (const line of help) {
        process.stderr.write(`help: ${line}\n`);
      }
    }
    return;
  }
  const body: CliListBody<Record<string, unknown>> = {
    count: input.items.length,
    items: input.items,
  };
  if (help !== undefined) {
    body.help = help;
  }
  emit(body);
}

export function emitOk(value: Record<string, unknown>, help?: string[]): void {
  const h = limitHelpLines(help);
  if (h === undefined) {
    emit({ ok: true, ...value });
    return;
  }
  emit({ ok: true, ...value, help: h });
}

export function fail(
  code: string,
  message: string,
  opts?: { help?: string[]; status?: number; exitCode?: number }
): never {
  const help = limitHelpLines(opts?.help);
  const error: CliErrorBody["error"] = { code, message };
  if (opts?.status !== undefined) {
    error.status = opts.status;
  }
  const body: CliErrorBody = { ok: false, error };
  if (help !== undefined) {
    body.help = help;
  }
  emit(body);
  throw new CliExitError(opts?.exitCode ?? 1);
}

function readProp(obj: object, key: string): unknown {
  return Reflect.get(obj, key);
}

function argAliases(def: object): string[] {
  const alias = readProp(def, "alias");
  if (typeof alias === "string") return [alias];
  if (
    Array.isArray(alias) &&
    alias.every((entry): entry is string => typeof entry === "string")
  ) {
    return alias;
  }
  return [];
}

/** Names/aliases accepted for a command's args (+ global format flags). */
function allowedFlagNames(argsDef: ArgsDef | undefined): Set<string> {
  const allowed = new Set<string>();
  const defs: ArgsDef = { ...argsDef, ...formatArgs };
  for (const [name, def] of Object.entries(defs)) {
    if (def.type === "positional") continue;
    allowed.add(name);
    allowed.add(camelCase(name));
    allowed.add(kebabCase(name));
    for (const a of argAliases(def)) {
      allowed.add(a);
      allowed.add(camelCase(a));
      allowed.add(kebabCase(a));
    }
    if (def.type === "boolean") {
      allowed.add(`no-${name}`);
      allowed.add(`no-${kebabCase(name)}`);
      allowed.add(camelCase(`no-${name}`));
    }
  }
  // Builtin help/version on leaf (citty handles these before run usually)
  allowed.add("help");
  allowed.add("h");
  allowed.add("version");
  allowed.add("v");
  return allowed;
}

function flagTokenName(token: string): string | null {
  if (token === "--" || !token.startsWith("-")) return null;
  if (token.startsWith("--")) {
    const body = token.slice(2).split("=")[0] ?? "";
    return body === "" ? null : body;
  }
  // -abc short cluster — treat each letter; unknown if any unknown
  const body = token.slice(1).split("=")[0] ?? "";
  return body === "" ? null : body;
}

function assertKnownFlags(ctx: {
  rawArgs: string[];
  cmd: { args?: unknown };
}): void {
  // citty types args as Resolvable<>; by run() they are already plain ArgsDef.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- citty Resolvable boundary
  const allowed = allowedFlagNames(ctx.cmd.args as ArgsDef | undefined);
  for (const token of ctx.rawArgs) {
    if (token === "--") break;
    if (!token.startsWith("-")) continue;

    if (token.startsWith("--")) {
      const name = flagTokenName(token);
      if (name === null) continue;
      if (!allowed.has(name) && !allowed.has(camelCase(name))) {
        fail("UNKNOWN_FLAG", `Unknown flag --${name}`, {
          help: ["wd --help"],
          exitCode: 2,
        });
      }
      continue;
    }

    // Short flags: -c or -abc
    const body = token.slice(1).split("=")[0] ?? "";
    if (body.length === 0) continue;
    for (const ch of body) {
      if (!allowed.has(ch)) {
        fail("UNKNOWN_FLAG", `Unknown flag -${ch}`, {
          help: ["wd --help"],
          exitCode: 2,
        });
      }
    }
  }
}

function isOrpcError(
  error: unknown
): error is { code: string; message: string; status?: number; data?: unknown } {
  if (typeof error !== "object" || error === null) return false;
  const code = readProp(error, "code");
  const message = readProp(error, "message");
  if (typeof code !== "string" || typeof message !== "string") return false;
  const name = readProp(error, "name");
  const status = readProp(error, "status");
  return name === "ORPCError" || typeof status === "number";
}

function taggedErrorEnvelope(error: unknown): {
  code: string;
  message: string;
} | null {
  if (typeof error !== "object" || error === null) return null;
  const tag = readProp(error, "_tag");
  if (typeof tag !== "string") return null;
  const reason = readProp(error, "reason");
  const resource = readProp(error, "resource");
  const fallback = readProp(error, "message");
  let message = tag;
  if (typeof reason === "string") {
    message = reason;
  } else if (typeof resource === "string") {
    message = resource;
  } else if (typeof fallback === "string") {
    message = fallback;
  }
  switch (tag) {
    case "NotFoundError": {
      return { code: "NOT_FOUND", message };
    }
    case "ConflictError": {
      return { code: "CONFLICT", message };
    }
    case "InvalidError": {
      return { code: "BAD_REQUEST", message };
    }
    case "ForbiddenError": {
      return { code: "FORBIDDEN", message };
    }
    default: {
      return null;
    }
  }
}

export function handleCliError(error: unknown): never {
  if (error instanceof CliExitError) {
    process.exit(error.exitCode);
  }
  if (debugEnabled()) {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`
    );
  }
  const tagged = taggedErrorEnvelope(error);
  if (tagged !== null) {
    fail(tagged.code, tagged.message, { help: ["wd --help"] });
  }
  if (isOrpcError(error)) {
    fail(error.code, error.message, {
      status: error.status,
      help: ["wd --help"],
    });
  }
  if (error instanceof Error) {
    fail("ERROR", error.message, { help: ["wd --help"] });
  }
  fail("ERROR", String(error), { help: ["wd --help"] });
}

/**
 * Wrap a leaf command `run`: unknown-flag check + structured error mapping.
 */
function withCli<T extends ArgsDef>(
  run: (ctx: CommandContext<T>) => void | Promise<void>
): (ctx: CommandContext<T>) => Promise<void> {
  return async (ctx) => {
    try {
      assertKnownFlags(ctx);
      await run(ctx);
    } catch (error) {
      if (error instanceof CliExitError) {
        process.exit(error.exitCode);
      }
      handleCliError(error);
    }
  };
}

/** Truncate a string for list output; `--full` skips. */
export function truncText(value: string, full: boolean, max = 80): string {
  if (full || value.length <= max) return value;
  return `${value.slice(0, max)}…(truncated, ${value.length} chars — use --full)`;
}

/** Recursively wrap all leaf `run` handlers (unknown flags + structured errors). */
export function wrapCommandTree<T extends ArgsDef>(
  cmd: CommandDef<T>
): CommandDef<T> {
  const next: CommandDef<T> = { ...cmd };
  if (typeof cmd.run === "function") {
    next.run = withCli(cmd.run);
  }
  if (
    cmd.subCommands !== undefined &&
    typeof cmd.subCommands === "object" &&
    Object.keys(cmd.subCommands).length > 0
  ) {
    const wrapped: Record<string, CommandDef> = {};
    // citty's SubCommandsDef is Resolvable<> (lazy getters / promises); at wrap
    // time we only walk already-materialized CommandDef children.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- citty Resolvable boundary
    const material = cmd.subCommands as Record<string, CommandDef>;
    for (const [name, sub] of Object.entries(material)) {
      wrapped[name] = wrapCommandTree(sub);
    }
    next.subCommands = wrapped;
  }
  return next;
}

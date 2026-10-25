/**
 * A Cap's version: a SHA-256 over the code its entry module reaches (#492). `pnpm generate:caps`
 * writes it into `capabilities.gen.json`; nothing authors it.
 *
 * The crawl starts at each Cap's `cap.ts` and follows every runtime import to the module that
 * DEFINES the imported symbol (a barrel is looked through, not hashed), so editing one vendor
 * in `@watchdog/tools/network` moves only the Caps that import that vendor. What is hashed:
 *
 * - every reached source module of this repo, `@watchdog/schemas` included, by path and content;
 * - for each npm package a reached module imports, its name and the version the lockfile
 *   resolves for the workspace package that imports it.
 *
 * What is not: generated files, `__tests__`, type-only imports (they cannot change what runs),
 * and the HTTP transport files of `packages/tools/src/http` (the SSRF guard, redirect loop, body
 * cap and client layer, which every Cap shares; a transport change is not a change of what a
 * Cap asks or how it reads the answer). An excluded module is not crawled either. The logic
 * files in that folder (http-probe, unshorten, page-enrich, oembed, fetch-json, ...) count.
 *
 * The parser is `oxc-parser`: TypeScript 7 ships no stable compiler API.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";

import { parseSync } from "oxc-parser";
import { z } from "zod";

/** How many hex characters of the SHA-256 a version keeps. */
const VERSION_HEX_LENGTH = 12;

/** `packages/tools/src/http` modules that are transport; a module whose name starts with `outbound-` is too. */
const TRANSPORT_FILES: ReadonlySet<string> = new Set([
  "safe-fetch",
  "capped-body",
  "http-client-layer",
  "redirect",
  "blocked-address",
  "abort-when",
  "transport-error",
]);
const TRANSPORT_DIR = "packages/tools/src/http";
const TRANSPORT_PREFIX = "outbound-";

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".json"] as const;
const BUILTINS: ReadonlySet<string> = new Set(builtinModules);

type ParsedModule = ReturnType<typeof parseSync>["module"] & {
  /** True when every statement only imports or re-exports: such a file is looked through. */
  pureBarrel: boolean;
  source: string;
};

type ImportBinding = { request: string; importName: string };

/** The crawl's result for one entry: reached repo files (relative, sorted) and `name@version`s. */
export type CrawlResult = { files: string[]; packages: string[] };

function toPosix(file: string): string {
  return file.split(path.sep).join("/");
}

/** True for a file the fingerprint never includes (and never crawls through). */
export function isExcludedFromFingerprint(relativePath: string): boolean {
  const rel = toPosix(relativePath);
  if (rel.includes("/__tests__/") || /\.test\.tsx?$/.test(rel)) return true;
  if (/\.gen\.[a-z]+$/.test(rel) || rel.includes("/generated/")) return true;
  if (path.posix.dirname(rel) === TRANSPORT_DIR) {
    const name = path.posix.basename(rel).replace(/\.[a-z]+$/, "");
    return TRANSPORT_FILES.has(name) || name.startsWith(TRANSPORT_PREFIX);
  }
  return false;
}

function stripJsonComments(text: string): string {
  return text
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n")
    .replaceAll(/,(\s*[}\]])/g, "$1");
}

const TSCONFIG_PATHS = z.object({
  compilerOptions: z
    .object({ paths: z.record(z.string(), z.array(z.string())).optional() })
    .optional(),
});

/** oxc-parser types its kinds as ambient const enums; compare them as plain strings. */
const kindOf = (kind: string): string => kind;

type PathAlias = { prefix: string; suffix: string; targets: string[] };

function readPathAliases(root: string): {
  exact: Map<string, string>;
  patterns: PathAlias[];
} {
  const raw = readFileSync(path.join(root, "tsconfig.json"), "utf-8");
  const parsed = TSCONFIG_PATHS.parse(JSON.parse(stripJsonComments(raw)));
  const exact = new Map<string, string>();
  const patterns: PathAlias[] = [];
  for (const [key, targets] of Object.entries(
    parsed.compilerOptions?.paths ?? {}
  )) {
    const star = key.indexOf("*");
    if (star === -1) {
      exact.set(key, targets[0] ?? "");
    } else {
      patterns.push({
        prefix: key.slice(0, star),
        suffix: key.slice(star + 1),
        targets,
      });
    }
  }
  // Longest prefix first, as TypeScript picks.
  patterns.sort((a, b) => b.prefix.length - a.prefix.length);
  return { exact, patterns };
}

/** `importers:` of pnpm-lock.yaml: workspace package dir to `dependency name -> resolved version`. */
export function parseLockfileImporters(
  lockfile: string
): Map<string, Map<string, string>> {
  const importers = new Map<string, Map<string, string>>();
  let inImporters = false;
  let importer: Map<string, string> | undefined;
  let name: string | undefined;
  for (const line of lockfile.split("\n")) {
    if (/^\S/.test(line)) {
      inImporters = line.startsWith("importers:");
      continue;
    }
    if (!inImporters) continue;
    const dir = /^ {2}(\S[^:]*):\s*$/.exec(line);
    if (dir) {
      importer = new Map();
      importers.set(dir[1]?.replaceAll(/^['"]|['"]$/g, "") ?? "", importer);
      name = undefined;
      continue;
    }
    const dep = /^ {6}(\S.*):\s*$/.exec(line);
    if (dep) {
      name = dep[1]?.replaceAll(/^['"]|['"]$/g, "");
      continue;
    }
    const version = /^ {8}version:\s*(.+?)\s*$/.exec(line);
    if (version && importer && name !== undefined) {
      const resolved = (version[1] ?? "")
        .replaceAll(/^['"]|['"]$/g, "")
        .replace(/\(.*$/, "");
      importer.set(name, resolved);
    }
  }
  return importers;
}

function packageNameOf(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@")
    ? parts.slice(0, 2).join("/")
    : (parts[0] ?? specifier);
}

function isFile(candidate: string): boolean {
  return existsSync(candidate) && statSync(candidate).isFile();
}

/** The source file a path names: as written, with an extension, or as a directory index. */
function probeSource(base: string): string | undefined {
  if (isFile(base)) return base;
  for (const ext of SOURCE_EXTENSIONS) {
    if (isFile(base + ext)) return base + ext;
  }
  for (const ext of SOURCE_EXTENSIONS) {
    const index = path.join(base, `index${ext}`);
    if (isFile(index)) return index;
  }
  return undefined;
}

function importedName(name: { kind: string; name: string | null }): string {
  if (kindOf(name.kind) === "Default") return "default";
  if (kindOf(name.kind) === "NamespaceObject") return "*";
  return name.name ?? "*";
}

function importBindings(mod: ParsedModule): Map<string, ImportBinding> {
  const bindings = new Map<string, ImportBinding>();
  for (const imp of mod.staticImports) {
    for (const spec of imp.entries) {
      bindings.set(spec.localName.value, {
        request: imp.moduleRequest.value,
        importName: importedName(spec.importName),
      });
    }
  }
  return bindings;
}

/** Dynamic `import("literal")` requests of a module. */
function dynamicRequests(mod: ParsedModule): string[] {
  const out: string[] = [];
  for (const dyn of mod.dynamicImports) {
    const text = mod.source.slice(
      dyn.moduleRequest.start,
      dyn.moduleRequest.end
    );
    const literal = /^\s*(['"`])([^'"`]+)\1\s*$/.exec(text);
    if (literal?.[2] !== undefined) out.push(literal[2]);
  }
  return out;
}

/**
 * Crawls from entry modules. One instance caches parsed files across entries; `crawl` is pure
 * in the working tree (it reads, never writes).
 */
export class CapCrawler {
  private readonly root: string;
  private readonly aliases: ReturnType<typeof readPathAliases>;
  private readonly lockfile: Map<string, Map<string, string>>;
  private readonly parsed = new Map<string, ParsedModule>();
  private readonly packageDirs = new Map<string, string>();

  constructor(root: string) {
    this.root = root;
    this.aliases = readPathAliases(root);
    this.lockfile = parseLockfileImporters(
      readFileSync(path.join(root, "pnpm-lock.yaml"), "utf-8")
    );
  }

  private rel(file: string): string {
    return toPosix(path.relative(this.root, file));
  }

  /** The repo file a specifier names, or the npm package it names. Builtins are `null`. */
  private resolve(
    specifier: string,
    from: string
  ): { file: string } | { pkg: string } | null {
    if (specifier.startsWith(".")) {
      const file = probeSource(path.resolve(path.dirname(from), specifier));
      if (file === undefined) {
        throw new Error(
          `cap fingerprint: cannot resolve "${specifier}" from ${this.rel(from)}`
        );
      }
      return { file };
    }
    if (specifier.startsWith("node:") || BUILTINS.has(specifier)) return null;
    const alias = this.aliases.exact.get(specifier);
    const targets =
      alias === undefined
        ? this.aliases.patterns.flatMap((p) =>
            specifier.startsWith(p.prefix) &&
            specifier.endsWith(p.suffix) &&
            specifier.length >= p.prefix.length + p.suffix.length
              ? p.targets.map((t) =>
                  t.replace(
                    "*",
                    specifier.slice(
                      p.prefix.length,
                      specifier.length - p.suffix.length
                    )
                  )
                )
              : []
          )
        : [alias];
    for (const target of targets) {
      const file = probeSource(path.resolve(this.root, target));
      if (file !== undefined) return { file };
    }
    if (specifier.startsWith("@watchdog/")) {
      throw new Error(
        `cap fingerprint: "${specifier}" matches no tsconfig path (imported from ${this.rel(from)})`
      );
    }
    return { pkg: packageNameOf(specifier) };
  }

  private parse(file: string): ParsedModule {
    const cached = this.parsed.get(file);
    if (cached) return cached;
    const source = readFileSync(file, "utf-8");
    if (file.endsWith(".json")) {
      const empty = parseSync("empty.ts", "").module;
      const mod = { ...empty, pureBarrel: false, source };
      this.parsed.set(file, mod);
      return mod;
    }
    const result = parseSync(file, source);
    const pureBarrel = result.program.body.every(
      (node) =>
        node.type === "ImportDeclaration" ||
        node.type === "ExportAllDeclaration" ||
        (node.type === "ExportNamedDeclaration" && node.declaration === null)
    );
    const mod = { ...result.module, pureBarrel, source };
    this.parsed.set(file, mod);
    return mod;
  }

  /**
   * The modules that define `name` as exported by `file`: through `export { x } from`,
   * `export *`, and re-exported imports, down to the module with the declaration. Null when
   * `file` does not export the name at all.
   */
  private definers(
    file: string,
    name: string,
    seen = new Set<string>()
  ): string[] | null {
    const key = `${file}\0${name}`;
    if (seen.has(key)) return null;
    seen.add(key);
    if (isExcludedFromFingerprint(this.rel(file))) return [];
    const mod = this.parse(file);
    const bindings = importBindings(mod);
    const stars: string[] = [];
    for (const exp of mod.staticExports) {
      for (const entry of exp.entries) {
        if (entry.isType) continue;
        const exportName =
          kindOf(entry.exportName.kind) === "Default"
            ? "default"
            : entry.exportName.name;
        const importKind = kindOf(entry.importName.kind);
        const request = entry.moduleRequest?.value;
        if (request !== undefined && importKind === "AllButDefault") {
          if (name !== "default") stars.push(request);
        } else if (exportName === name) {
          if (request !== undefined) {
            const target = this.resolve(request, file);
            if (target === null || "pkg" in target) return [file];
            const inner =
              importKind === "All" ? "*" : (entry.importName.name ?? name);
            return inner === "*"
              ? [target.file]
              : (this.definers(target.file, inner, seen) ?? [target.file]);
          }
          const local = entry.localName.name;
          const binding = local === null ? undefined : bindings.get(local);
          if (binding) {
            const target = this.resolve(binding.request, file);
            if (target === null || "pkg" in target) return [file];
            return binding.importName === "*"
              ? [target.file]
              : (this.definers(target.file, binding.importName, seen) ?? [
                  target.file,
                ]);
          }
          return [file];
        }
      }
    }
    for (const request of stars) {
      const target = this.resolve(request, file);
      if (target === null || "pkg" in target) continue;
      const found = this.definers(target.file, name, seen);
      if (found !== null) return found;
    }
    return null;
  }

  private packageDirOf(file: string): string {
    let dir = path.dirname(file);
    const cached = this.packageDirs.get(dir);
    if (cached !== undefined) return cached;
    const start = dir;
    while (!existsSync(path.join(dir, "package.json"))) {
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    const rel = this.rel(dir);
    this.packageDirs.set(start, rel === "" ? "." : rel);
    return rel === "" ? "." : rel;
  }

  private lockedVersion(pkg: string, importerFile: string): string {
    const dir = this.packageDirOf(importerFile);
    const version = this.lockfile.get(dir)?.get(pkg);
    if (version === undefined) {
      throw new Error(
        `cap fingerprint: ${this.rel(importerFile)} imports "${pkg}", which pnpm-lock.yaml does not list for "${dir}"`
      );
    }
    return version;
  }

  /** Everything the entry module reaches. */
  crawl(entryFile: string): CrawlResult {
    const files = new Set<string>();
    const packages = new Set<string>();
    const visitedNarrow = new Set<string>();
    const visitedAll = new Set<string>();

    const visit = (file: string, all: boolean): void => {
      const seen = all ? visitedAll : visitedNarrow;
      if (seen.has(file)) return;
      seen.add(file);
      if (isExcludedFromFingerprint(this.rel(file))) return;
      const mod = this.parse(file);
      if (!mod.pureBarrel || all) files.add(file);

      const follow = (request: string, names: string[] | "all"): void => {
        const target = this.resolve(request, file);
        if (target === null) return;
        if ("pkg" in target) {
          packages.add(`${target.pkg}@${this.lockedVersion(target.pkg, file)}`);
          return;
        }
        if (names === "all") {
          visit(target.file, true);
          return;
        }
        for (const name of names) {
          const defining = this.definers(target.file, name);
          for (const def of defining ?? [target.file]) visit(def, false);
        }
        // `import "x"` runs the module for its side effects.
        if (names.length === 0) visit(target.file, false);
      };

      for (const imp of mod.staticImports) {
        const names: string[] = [];
        let wholeModule = false;
        for (const entry of imp.entries) {
          if (entry.isType) continue;
          const kind = kindOf(entry.importName.kind);
          if (kind === "NamespaceObject") wholeModule = true;
          else
            names.push(
              kind === "Default" ? "default" : (entry.importName.name ?? "")
            );
        }
        // A declaration whose every specifier is a type imports nothing at runtime.
        if (imp.entries.length > 0 && !wholeModule && names.length === 0)
          continue;
        follow(imp.moduleRequest.value, wholeModule ? "all" : names);
      }
      for (const request of dynamicRequests(mod)) follow(request, "all");
      if (all) {
        for (const exp of mod.staticExports) {
          for (const entry of exp.entries) {
            if (entry.isType || entry.moduleRequest === null) continue;
            follow(entry.moduleRequest.value, "all");
          }
        }
      }
    };

    visit(entryFile, false);
    return {
      files: [...files].map((f) => this.rel(f)).sort(),
      packages: [...packages].sort(),
    };
  }

  /** The short fingerprint of a crawl: file paths with content hashes, then the packages. */
  fingerprint(entryFile: string): string {
    const { files, packages } = this.crawl(entryFile);
    const lines = files.map((file) => {
      const text = readFileSync(path.join(this.root, file), "utf-8");
      const content = createHash("sha256")
        .update(text.replaceAll("\r\n", "\n"))
        .digest("hex");
      return `file ${file} ${content}`;
    });
    for (const pkg of packages) lines.push(`npm ${pkg}`);
    return createHash("sha256")
      .update(lines.join("\n"))
      .digest("hex")
      .slice(0, VERSION_HEX_LENGTH);
  }
}

/**
 * Cap id to the Cap's entry module, from `registry.ts`: a Cap lives at
 * `<category>/<rest of the id>/cap.ts`, so `network.dns.lookup` is `network/dns.lookup/cap.ts`.
 */
export function capEntryFiles(capsSrcDir: string): Map<string, string> {
  const registry = path.join(capsSrcDir, "registry.ts");
  const mod = parseSync(registry, readFileSync(registry, "utf-8")).module;
  const entries = new Map<string, string>();
  for (const imp of mod.staticImports) {
    const request = imp.moduleRequest.value;
    if (!request.endsWith("/cap")) continue;
    const segments = request.slice(2, -"/cap".length).split("/");
    const category = segments[0] ?? "";
    const id = `${category}.${segments.slice(1).join("/")}`;
    entries.set(id, path.join(capsSrcDir, `${request}.ts`));
  }
  return entries;
}

/** Fingerprint of every Cap in the registry, keyed by Cap id. */
export function computeCapVersions(
  root: string,
  capIds: readonly string[]
): Record<string, string> {
  const entries = capEntryFiles(path.join(root, "packages", "caps", "src"));
  const crawler = new CapCrawler(root);
  const versions: Record<string, string> = {};
  for (const id of capIds) {
    const entry = entries.get(id);
    if (entry === undefined) {
      throw new Error(
        `cap fingerprint: no cap.ts import in registry.ts for Cap "${id}"`
      );
    }
    versions[id] = crawler.fingerprint(entry);
  }
  return versions;
}

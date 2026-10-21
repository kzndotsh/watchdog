#!/usr/bin/env node
/**
 * Codemod (#445, spec #442): move hand wrappers around repo calls in `packages/core/src`
 * onto the Effect repo modules of `infra/repos-fx.ts`.
 *
 *   tryDb(() => xRepo.m(EXEC, ...args))            -> xRepoFx.m(EXEC, ...args)
 *   tryDbWith((exec) => xRepo.m(exec, ...args))    -> xRepoFxDb.m(...args)
 *   tryDbOn(EXEC, (h) => xRepo.m(h, ...args))      -> onExec(EXEC, (h) => xRepoFx.m(h, ...args))
 *
 * It leaves a call alone, and lists it, when it:
 *   - passes the `opts` argument (the conflict mapping needs the raw driver error);
 *   - wraps more than one repo call, or logic, or a callee that is not an imported `xRepo`;
 *   - would evaluate a call-bearing argument earlier: the Fx form builds its arguments when
 *     the Effect is built, the wrapper when it runs. Such a call moves only where it is
 *     `yield*`ed at once, where both moments coincide.
 * `tryDbOn` stays lazy (the thunk is kept), so nothing moves in time there.
 *
 * Idempotent: a second run finds nothing. It adds the `xRepoFx` / `xRepoFxDb` exports it
 * needs to `infra/repos-fx.ts` and fixes the imports of each file it edits. It does not
 * format or sort imports: run `pnpm fix` afterwards. Parsing is oxc-parser (TypeScript 7
 * ships no JavaScript compiler API).
 *
 *   node scripts/codemods/effect-repos.mjs [--dry]
 */
/* oxlint-disable typescript/no-unsafe-assignment, typescript/no-unsafe-member-access, typescript/no-unsafe-argument, typescript/no-unsafe-call, typescript/no-unsafe-return -- oxc-parser returns ESTree nodes typed `any`; the codemod reads them by `type` */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { parseSync } from "oxc-parser";

const root = path.resolve(import.meta.dirname, "../..");
const CORE_SRC = "packages/core/src";
const REPOS_FX = `${CORE_SRC}/infra/repos-fx.ts`;
const REPO_FX = `${CORE_SRC}/infra/repo-fx.ts`;
const POSTGRES_EFFECT = `${CORE_SRC}/infra/postgres-effect.ts`;
const WRAPPERS = new Set(["tryDb", "tryDbWith", "tryDbOn"]);
const REPO_NAME = /^[a-z][A-Za-z0-9]*Repo$/;

const dry = process.argv.slice(2).includes("--dry");

/** @type {string[]} */
const left = [];
let movedCount = 0;

/** Production files of core: no tests, no `__tests__`. */
const files = execFileSync("git", ["ls-files", `${CORE_SRC}/**/*.ts`], {
  cwd: root,
  encoding: "utf-8",
})
  .split("\n")
  .filter(
    (f) =>
      f !== "" &&
      !f.includes("/__tests__/") &&
      !/\.(test|spec|int\.test)\.ts$/.test(f) &&
      f !== REPOS_FX &&
      f !== REPO_FX &&
      f !== POSTGRES_EFFECT
  );

/** @typedef {{ type: string, start: number, end: number, parent?: Node, [k: string]: any }} Node */

/**
 * Child nodes of an ESTree node, in source order.
 * @param {Node} node
 * @returns {Node[]}
 */
function childrenOf(node) {
  /** @type {Node[]} */
  const out = [];
  for (const [key, value] of Object.entries(node)) {
    if (key === "parent") continue;
    const items = Array.isArray(value) ? value : [value];
    for (const item of items) {
      if (
        item !== null &&
        typeof item === "object" &&
        typeof item.type === "string"
      ) {
        out.push(item);
      }
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/**
 * Link every node to its parent.
 * @param {Node} node
 */
function link(node) {
  for (const child of childrenOf(node)) {
    child.parent = node;
    link(child);
  }
}

/**
 * @param {string} file
 * @param {string} text
 * @returns {Node}
 */
function parse(file, text) {
  const { program, errors } = parseSync(file, text, { lang: "ts" });
  if (errors.length > 0) throw new Error(`${file}: ${errors[0].message}`);
  // Parent links are added in place.
  const tree = program;
  link(tree);
  return tree;
}

/**
 * @param {Node} node
 * @returns {Node}
 */
const unwrapParens = (node) =>
  node.type === "ParenthesizedExpression"
    ? unwrapParens(node.expression)
    : node;

const EFFECT_TYPES = new Set([
  "CallExpression",
  "NewExpression",
  "AwaitExpression",
  "YieldExpression",
  "UpdateExpression",
  "AssignmentExpression",
  "TaggedTemplateExpression",
]);

/**
 * Whether evaluating `node` earlier or later could differ: it holds a call, `new`, an
 * assignment, an update, `await` or `yield`. Function bodies do not run at evaluation.
 * @param {Node} node
 * @returns {boolean}
 */
function hasEffect(node) {
  if (EFFECT_TYPES.has(node.type)) return true;
  if (
    node.type === "ArrowFunctionExpression" ||
    node.type === "FunctionExpression"
  ) {
    return false;
  }
  return childrenOf(node).some(hasEffect);
}

/**
 * @param {Node} node
 * @param {string} name
 * @returns {boolean}
 */
const mentions = (node, name) =>
  (node.type === "Identifier" && node.name === name) ||
  childrenOf(node).some((c) => mentions(c, name));

/**
 * Whether the call is the operand of a `yield*`, directly or through `.pipe(...)` (an Effect run at once, so the moment it is
 * built and the moment it runs coincide).
 * @param {Node} call
 */
function isYieldedAtOnce(call) {
  let node = call;
  for (;;) {
    const { parent } = node;
    if (parent?.type === "ParenthesizedExpression") {
      node = parent;
    } else if (
      parent?.type === "MemberExpression" &&
      parent.object === node &&
      parent.property.name === "pipe" &&
      parent.parent?.type === "CallExpression" &&
      parent.parent.callee === parent
    ) {
      // `.pipe(...)` on the Effect runs when the Effect does, not earlier.
      node = parent.parent;
    } else {
      return parent?.type === "YieldExpression" && parent.delegate === true;
    }
  }
}

/**
 * The `xRepo.m(...)` call a thunk body is, or null.
 * @param {Node} fn
 * @param {Set<string>} repos
 */
function repoCallOf(fn, repos) {
  if (
    fn.type !== "ArrowFunctionExpression" ||
    fn.body.type === "BlockStatement"
  ) {
    return null;
  }
  const body = unwrapParens(fn.body);
  if (
    body.type !== "CallExpression" ||
    body.callee.type !== "MemberExpression" ||
    body.callee.computed ||
    body.callee.object.type !== "Identifier" ||
    !repos.has(body.callee.object.name)
  ) {
    return null;
  }
  return {
    call: body,
    callee: body.callee,
    repo: String(body.callee.object.name),
    method: String(body.callee.property.name),
  };
}

/**
 * @param {Node} program
 * @returns {Set<string>} `xRepo` names imported from `@watchdog/db`
 */
function importedRepos(program) {
  /** @type {Set<string>} */
  const names = new Set();
  for (const stmt of program.body) {
    if (
      stmt.type === "ImportDeclaration" &&
      stmt.source.value === "@watchdog/db" &&
      stmt.importKind !== "type"
    ) {
      for (const el of stmt.specifiers) {
        if (
          el.type === "ImportSpecifier" &&
          el.importKind !== "type" &&
          el.imported.name === el.local.name &&
          REPO_NAME.test(el.local.name)
        ) {
          names.add(el.local.name);
        }
      }
    }
  }
  return names;
}

/**
 * The source text of `list` from its first to its last element, or "".
 * @param {string} text
 * @param {Node[]} list
 */
const textOf = (text, list) =>
  list.length === 0 ? "" : text.slice(list[0].start, list.at(-1).end);

/**
 * Rewrites for one parse of one file.
 * @param {string} file
 * @param {string} text
 * @param {Node} program
 * @param {Set<string>} repos
 * @param {Map<string, Set<string>>} needs `xRepo` -> {"Fx", "FxDb"}
 * @returns {{ edits: { start: number, end: number, text: string }[], usesOnExec: boolean }}
 */
function collectEdits(file, text, program, repos, needs) {
  /** @type {{ start: number, end: number, text: string }[]} */
  const edits = [];
  let usesOnExec = false;
  /**
   * @param {Node} n
   * @param {string} why
   */
  const skip = (n, why) => {
    const line = text.slice(0, n.start).split("\n").length;
    left.push(`${file}:${line}  ${why}`);
  };
  /**
   * @param {string} repo
   * @param {string} kind
   */
  const need = (repo, kind) => {
    const set = needs.get(repo) ?? new Set();
    set.add(kind);
    needs.set(repo, set);
  };

  /** @param {Node} node */
  const visit = (node) => {
    if (
      node.type === "CallExpression" &&
      node.callee.type === "Identifier" &&
      WRAPPERS.has(node.callee.name)
    ) {
      const wrapper = String(node.callee.name);
      const thunkIndex = wrapper === "tryDbOn" ? 1 : 0;
      /** @type {Node[]} */
      const callArgs = node.arguments;
      const thunk = callArgs[thunkIndex];
      if (callArgs.length > thunkIndex + 1) {
        skip(
          node,
          `${wrapper}: passes opts (the conflict mapping needs the raw driver error)`
        );
      } else if (
        node.typeArguments !== null &&
        node.typeArguments !== undefined
      ) {
        skip(node, `${wrapper}: explicit type arguments`);
      } else if (thunk === undefined) {
        skip(node, `${wrapper}: no thunk`);
      } else {
        const found = repoCallOf(thunk, repos);
        if (found === null) {
          skip(node, `${wrapper}: not a single imported \`xRepo.m(...)\` call`);
        } else {
          const { call, callee, repo, method } = found;
          /** @type {Node[]} */
          const innerArgs = call.arguments;
          if (wrapper === "tryDb") {
            if (innerArgs.some(hasEffect) && !isYieldedAtOnce(node)) {
              skip(
                node,
                `tryDb: ${repo}.${method} has a call-bearing argument and is not yielded at once (eager evaluation)`
              );
            } else {
              need(repo, "Fx");
              edits.push({
                start: node.start,
                end: node.end,
                text: `${repo}Fx.${method}(${textOf(text, innerArgs)})`,
              });
              movedCount += 1;
            }
          } else if (wrapper === "tryDbWith") {
            const param = thunk.params[0];
            const first = innerArgs[0];
            const rest = innerArgs.slice(1);
            if (
              thunk.params.length !== 1 ||
              param.type !== "Identifier" ||
              first === undefined ||
              first.type !== "Identifier" ||
              first.name !== param.name ||
              rest.some((a) => mentions(a, first.name))
            ) {
              skip(
                node,
                `tryDbWith: ${repo}.${method} does not pass its handle first and alone`
              );
            } else if (rest.some(hasEffect) && !isYieldedAtOnce(node)) {
              skip(
                node,
                `tryDbWith: ${repo}.${method} has a call-bearing argument and is not yielded at once (eager evaluation)`
              );
            } else {
              need(repo, "FxDb");
              edits.push({
                start: node.start,
                end: node.end,
                text: `${repo}FxDb.${method}(${textOf(text, rest)})`,
              });
              movedCount += 1;
            }
          } else {
            need(repo, "Fx");
            usesOnExec = true;
            edits.push(
              {
                start: node.callee.start,
                end: node.callee.end,
                text: "onExec",
              },
              {
                start: callee.start,
                end: callee.end,
                text: `${repo}Fx.${method}`,
              }
            );
            movedCount += 1;
          }
        }
      }
    }
    for (const child of childrenOf(node)) visit(child);
  };
  visit(program);
  // Keep the outermost of any nested edits; the next pass finds the rest.
  edits.sort((a, b) => a.start - b.start || b.end - a.end);
  /** @type {typeof edits} */
  const kept = [];
  for (const e of edits) {
    const last = kept.at(-1);
    if (last === undefined || e.start >= last.end) kept.push(e);
  }
  return { edits: kept, usesOnExec };
}

/**
 * @param {string} text
 * @param {{ start: number, end: number, text: string }[]} edits
 */
const applyEdits = (text, edits) =>
  edits.reduceRight(
    (acc, e) => acc.slice(0, e.start) + e.text + acc.slice(e.end),
    text
  );

/**
 * Whether `name` is still used outside import declarations.
 * @param {Node} node
 * @param {string} name
 * @returns {boolean}
 */
function usedOutsideImports(node, name) {
  if (node.type === "ImportDeclaration") return false;
  if (node.type === "Identifier" && node.name === name) return true;
  return childrenOf(node).some((c) => usedOutsideImports(c, name));
}

/**
 * Add `add` to the named import of `spec` (creating it) and drop the `dropIfUnused` names no
 * longer used. Import order and wrapping are left to `pnpm fix`.
 * @param {string} file
 * @param {string} text
 * @param {string} spec module specifier
 * @param {string[]} add
 * @param {string[]} dropIfUnused
 */
function fixImports(file, text, spec, add, dropIfUnused) {
  const program = parse(file, text);
  /** @type {Node[]} */
  const body = program.body;
  const decl = body.find(
    (s) =>
      s.type === "ImportDeclaration" &&
      s.source.value === spec &&
      s.importKind !== "type" &&
      s.specifiers.length > 0 &&
      s.specifiers.every((x) => x.type === "ImportSpecifier")
  );
  if (decl === undefined) {
    if (add.length === 0) return text;
    const line = `import { ${add.join(", ")} } from "${spec}";`;
    const last = body.findLast((s) => s.type === "ImportDeclaration");
    return last === undefined
      ? `${line}\n${text}`
      : `${text.slice(0, last.end)}\n${line}${text.slice(last.end)}`;
  }
  /** @type {Node[]} */
  const specifiers = decl.specifiers;
  const kept = specifiers
    .filter(
      (el) =>
        !dropIfUnused.includes(el.local.name) ||
        usedOutsideImports(program, el.local.name)
    )
    .map((el) => text.slice(el.start, el.end));
  for (const name of add) if (!kept.includes(name)) kept.push(name);
  if (kept.length === 0) {
    return text.slice(0, decl.start) + text.slice(decl.end).replace(/^\n/, "");
  }
  const allTypes = kept.every((k) => k.startsWith("type "));
  const clause = allTypes
    ? `import type { ${kept.map((k) => k.slice(5)).join(", ")} }`
    : `import { ${kept.join(", ")} }`;
  return `${text.slice(0, decl.start)}${clause} from "${spec}";${text.slice(decl.end)}`;
}

/**
 * @param {string} from importing file
 * @param {string} to imported file
 */
const relativeSpec = (from, to) => {
  const rel = path
    .relative(path.dirname(from), to.replace(/\.ts$/, ""))
    .split(path.sep)
    .join("/");
  return rel.startsWith(".") ? rel : `./${rel}`;
};

/** @type {Map<string, Set<string>>} */
const allNeeds = new Map();
let fileCount = 0;

for (const file of files) {
  const abs = path.join(root, file);
  const original = readFileSync(abs, "utf-8");
  if (!/\btryDb(With|On)?\(/.test(original)) continue;
  let text = original;
  /** @type {Map<string, Set<string>>} */
  const needs = new Map();
  let usesOnExec = false;
  for (let pass = 0; pass < 4; pass += 1) {
    const program = parse(file, text);
    const before = left.length;
    const found = collectEdits(
      file,
      text,
      program,
      importedRepos(program),
      needs
    );
    if (pass > 0) left.length = before;
    if (found.edits.length === 0) break;
    usesOnExec ||= found.usesOnExec;
    text = applyEdits(text, found.edits);
  }
  if (text === original) continue;
  fileCount += 1;

  /** @type {string[]} */
  const repoFxNames = [];
  for (const [repo, kinds] of needs) {
    for (const kind of kinds) repoFxNames.push(`${repo}${kind}`);
    const all = allNeeds.get(repo) ?? new Set();
    for (const kind of kinds) all.add(kind);
    allNeeds.set(repo, all);
  }
  const repos = [...importedRepos(parse(file, text))];
  text = fixImports(file, text, "@watchdog/db", [], repos);
  text = fixImports(file, text, relativeSpec(file, REPOS_FX), repoFxNames, []);
  if (usesOnExec) {
    text = fixImports(file, text, relativeSpec(file, REPO_FX), ["onExec"], []);
  }
  text = fixImports(
    file,
    text,
    relativeSpec(file, POSTGRES_EFFECT),
    [],
    [...WRAPPERS]
  );
  if (!dry) writeFileSync(abs, text);
}

// repos-fx.ts: one export per Fx / FxDb the rewrite needs.
{
  const abs = path.join(root, REPOS_FX);
  let text = readFileSync(abs, "utf-8");
  /** @type {Node[]} */
  const body = parse(REPOS_FX, text).body;
  /** @type {Set<string>} */
  const declared = new Set();
  /** @type {Set<string>} */
  const exported = new Set();
  for (const stmt of body) {
    const isExport = stmt.type === "ExportNamedDeclaration";
    const decl = isExport ? stmt.declaration : stmt;
    if (decl?.type === "VariableDeclaration") {
      for (const d of decl.declarations) {
        declared.add(d.id.name);
        if (isExport) exported.add(d.id.name);
      }
    }
  }
  /** @type {string[]} */
  const dbImports = [];
  let appended = "";
  const sorted = [...allNeeds].sort(([a], [b]) => a.localeCompare(b));
  for (const [repo, kinds] of sorted) {
    const fx = `${repo}Fx`;
    if (!declared.has(fx)) {
      dbImports.push(repo);
      appended += `${kinds.has("Fx") ? "export " : ""}const ${fx} = repoFx(() => ${repo});\n`;
    } else if (kinds.has("Fx") && !exported.has(fx)) {
      text = text.replace(`const ${fx} =`, `export const ${fx} =`);
    }
    if (kinds.has("FxDb") && !declared.has(`${fx}Db`)) {
      appended += `export const ${fx}Db = repoFxDb(${fx});\n`;
    }
  }
  if (appended !== "") {
    text = fixImports(REPOS_FX, text, "@watchdog/db", dbImports, []);
    text = `${text.trimEnd()}\n${appended}`;
  }
  if (!dry && text !== readFileSync(abs, "utf-8")) writeFileSync(abs, text);
}

if (left.length > 0) console.log(left.join("\n"));
console.log(
  `effect-repos: moved ${movedCount} site(s) in ${fileCount} file(s); left ${left.length}${dry ? " (dry run: nothing written)" : ""}`
);
if (!dry && fileCount > 0) {
  console.log("Next: pnpm fix (format, import order), then pnpm typecheck.");
}

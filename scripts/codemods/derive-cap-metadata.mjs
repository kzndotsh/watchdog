#!/usr/bin/env node
/**
 * Codemod (#313 part A): drop the Cap metadata that is now derived, in every
 * `packages/caps/src/**\/cap.ts`.
 *
 *   flags: ["needs_key", "third_party", "slow"]   -> flags: ["slow"]   (needs_key comes from
 *                                                    credentials, third_party from egress)
 *   reportLabel: "x.lookup"                       -> removed (defaults to the Cap id)
 *   const UA = "Watchdog/1.0 (+<id>; OSINT)"      -> removed; `fetch: (ctx) =>` becomes
 *   userAgent: UA / userAgent: "Watchdog/..."        `fetch: (ctx, { userAgent }) =>` and the
 *                                                    use becomes `userAgent` (defineCollectCap
 *                                                    passes `watchdogUserAgent(id)`)
 *
 * A UA string that is not exactly `watchdogUserAgent(<id>)` is left alone and listed, so a
 * provider-facing format never changes silently. Idempotent: a second run finds nothing.
 * It does not format: run `pnpm fix` afterwards, then `pnpm generate:caps` (the descriptor
 * must not change). Parsing is oxc-parser.
 *
 *   node scripts/codemods/derive-cap-metadata.mjs [--dry]
 */
/* oxlint-disable typescript/no-unsafe-assignment, typescript/no-unsafe-member-access, typescript/no-unsafe-argument, typescript/no-unsafe-call, typescript/no-unsafe-return -- oxc-parser returns ESTree nodes typed `any`; the codemod reads them by `type` */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { parseSync } from "oxc-parser";

const root = path.resolve(import.meta.dirname, "../..");
const DEFINERS = new Set(["defineCollectCap", "defineCapability"]);
const DERIVED_FLAGS = new Set(["needs_key", "third_party"]);

/** Keep in step with `watchdogUserAgent` in packages/tools/src/errors/user-agent.ts. */
const userAgentFor = (id) => `Watchdog/1.0 (+${id}; OSINT)`;

const keyName = (prop) =>
  prop.key?.type === "Identifier" ? prop.key.name : prop.key?.value;

const stringValue = (node) =>
  node?.type === "Literal" && typeof node.value === "string"
    ? node.value
    : undefined;

/** Walk every node (parent first). */
function walk(node, visit) {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  if (typeof node.type === "string") visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (key !== "parent") walk(value, visit);
  }
}

/** Widen a property removal to its comma and its own line. */
function lineRemoval(source, start, end) {
  let from = start;
  while (from > 0 && (source[from - 1] === " " || source[from - 1] === "\t")) {
    from -= 1;
  }
  let to = end;
  if (source[to] === ",") to += 1;
  let probe = to;
  while (source[probe] === " " || source[probe] === "\t") probe += 1;
  if (source[probe] === "\n") to = probe + 1;
  else from = start;
  return [from, to];
}

/**
 * @param {string} source
 * @param {string} filename
 * @returns {{ source: string, counts: Record<string, number>, notes: string[] }}
 */
export function transformCapSource(source, filename) {
  const counts = {
    reportLabelEqualId: 0,
    reportLabelShortened: 0,
    needsKeyFlag: 0,
    thirdPartyFlag: 0,
    flagsRemoved: 0,
    uaConst: 0,
    uaUses: 0,
  };
  const notes = [];
  const { program, errors } = parseSync(filename, source);
  if (errors.length > 0) {
    return { source, counts, notes: [`${filename}: parse error, skipped`] };
  }

  const edits = [];
  const edit = (start, end, text) => edits.push({ start, end, text });

  const calls = [];
  walk(program, (node) => {
    if (
      node.type === "CallExpression" &&
      node.callee.type === "Identifier" &&
      DEFINERS.has(node.callee.name) &&
      node.arguments[0]?.type === "ObjectExpression"
    ) {
      calls.push(node.arguments[0]);
    }
  });
  if (calls.length !== 1) {
    return { source, counts, notes };
  }
  const object = calls[0];
  const props = object.properties.filter((p) => p.type === "Property");
  const byName = (name) => props.find((p) => keyName(p) === name);
  const id = stringValue(byName("id")?.value);
  const egress = stringValue(byName("egress")?.value);

  const reportLabel = byName("reportLabel");
  if (reportLabel !== undefined) {
    const value = stringValue(reportLabel.value);
    if (value === undefined) {
      notes.push(`${filename}: non-literal reportLabel left alone`);
    } else {
      if (value === id) counts.reportLabelEqualId += 1;
      else counts.reportLabelShortened += 1;
      edit(...lineRemoval(source, reportLabel.start, reportLabel.end), "");
    }
  }

  const flags = byName("flags");
  if (flags?.value.type === "ArrayExpression") {
    const kept = [];
    let removed = 0;
    for (const element of flags.value.elements) {
      const flag = stringValue(element);
      if (flag !== undefined && DERIVED_FLAGS.has(flag)) {
        removed += 1;
        if (flag === "needs_key") counts.needsKeyFlag += 1;
        else {
          counts.thirdPartyFlag += 1;
          if (egress !== "third_party") {
            notes.push(
              `${filename}: third_party flag without egress "third_party"`
            );
          }
        }
      } else {
        kept.push(source.slice(element.start, element.end));
      }
    }
    if (removed > 0) {
      if (kept.length === 0) {
        counts.flagsRemoved += 1;
        edit(...lineRemoval(source, flags.start, flags.end), "");
      } else {
        edit(flags.value.start, flags.value.end, `[${kept.join(", ")}]`);
      }
    }
  }

  // User agent: the module-level const, then each use.
  let uaConst;
  for (const statement of program.body) {
    if (statement.type !== "VariableDeclaration") continue;
    for (const decl of statement.declarations) {
      if (decl.id.type === "Identifier" && decl.id.name === "UA") {
        uaConst = { statement, value: stringValue(decl.init) };
      }
    }
  }
  const sameAsHelper = (value) =>
    id !== undefined && value === userAgentFor(id);
  const uaIsHelper = uaConst !== undefined && sameAsHelper(uaConst.value);
  if (uaConst !== undefined && !uaIsHelper) {
    notes.push(
      `${filename}: UA is not watchdogUserAgent(id): ${JSON.stringify(uaConst.value)}`
    );
  }

  const uses = [];
  walk(object, (node) => {
    if (
      node.type === "Property" &&
      keyName(node) === "userAgent" &&
      node.value.type === "Identifier" &&
      node.value.name === "UA" &&
      uaIsHelper
    ) {
      uses.push({ start: node.start, end: node.end });
    } else if (
      node.type === "Property" &&
      keyName(node) === "userAgent" &&
      sameAsHelper(stringValue(node.value))
    ) {
      uses.push({ start: node.start, end: node.end });
    } else if (
      node.type === "CallExpression" &&
      uaIsHelper &&
      node.arguments.some((a) => a.type === "Identifier" && a.name === "UA")
    ) {
      for (const arg of node.arguments) {
        if (arg.type === "Identifier" && arg.name === "UA") {
          uses.push({ start: arg.start, end: arg.end, positional: true });
        }
      }
    }
  });
  const fetchProp = byName("fetch");
  const fetchFn = fetchProp?.value;
  if (
    uses.length > 0 &&
    fetchFn !== undefined &&
    (fetchFn.type === "ArrowFunctionExpression" ||
      fetchFn.type === "FunctionExpression") &&
    fetchFn.params.length === 1 &&
    uses.every((u) => u.start >= fetchFn.start && u.end <= fetchFn.end)
  ) {
    for (const use of uses) edit(use.start, use.end, "userAgent");
    counts.uaUses += uses.length;
    const [param] = fetchFn.params;
    edit(param.end, param.end, ", { userAgent }");
    if (uaIsHelper) {
      counts.uaConst += 1;
      edit(
        ...lineRemoval(source, uaConst.statement.start, uaConst.statement.end),
        ""
      );
    }
  } else if (uses.length > 0 || uaIsHelper) {
    notes.push(`${filename}: UA used outside fetch(ctx), left alone`);
  }

  let out = source;
  for (const { start, end, text } of edits.toSorted(
    (a, b) => b.start - a.start
  )) {
    out = out.slice(0, start) + text + out.slice(end);
  }
  return { source: out, counts, notes };
}

function main() {
  const dry = process.argv.slice(2).includes("--dry");
  const files = execFileSync("git", ["ls-files", "packages/caps/src"], {
    cwd: root,
    encoding: "utf-8",
  })
    .split("\n")
    .filter((f) => f.endsWith("/cap.ts"));
  const totals = {};
  const allNotes = [];
  let changed = 0;
  for (const file of files) {
    const abs = path.join(root, file);
    const before = readFileSync(abs, "utf-8");
    const { source, counts, notes } = transformCapSource(before, file);
    for (const [k, v] of Object.entries(counts))
      totals[k] = (totals[k] ?? 0) + v;
    allNotes.push(...notes);
    if (source !== before) {
      changed += 1;
      if (!dry) writeFileSync(abs, source);
    }
  }
  console.log(
    `${dry ? "would change" : "changed"} ${changed} of ${files.length} cap.ts files`
  );
  console.log(JSON.stringify(totals, null, 2));
  for (const note of allNotes) console.log(`note: ${note}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();

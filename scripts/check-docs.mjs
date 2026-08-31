#!/usr/bin/env node
/**
 * Durable-docs gate: recursive docs/** link + anchor checks, root markdown
 * (README/ROADMAP/CLAUDE), AGENTS.md links at fail level, docs/README.md index
 * coverage, and optional leaf line-budget warns.
 *
 * --strict (or CHECK_DOCS_STRICT=1): exit 1 on any fail.
 * --fail-length: treat leaf line-budget exceeds as fails (D6).
 */
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const strict =
  process.argv.includes("--strict") || process.env.CHECK_DOCS_STRICT === "1";
const failLength = process.argv.includes("--fail-length");

const MD_LINK = /\[([^\]]*)\]\(([^)]+)\)/g;
const HEADING = /^#{1,6}\s+(.+?)\s*$/;

/** @type {{ level: "warn" | "fail"; msg: string }[]} */
const findings = [];

/**
 * @param {"warn" | "fail"} level
 * @param {string} msg
 */
function note(level, msg) {
  findings.push({ level, msg });
}

/**
 * @param {string} heading
 * @returns {string}
 */
function slugify(heading) {
  return heading
    .toLowerCase()
    .replaceAll(/[^\w\s-]/g, "")
    .trim()
    .replaceAll(/\s+/g, "-");
}

/**
 * @param {string} text
 * @returns {Set<string>}
 */
function collectAnchors(text) {
  /** @type {Set<string>} */
  const set = new Set();
  for (const line of text.split("\n")) {
    const m = HEADING.exec(line);
    if (!m?.[1]) continue;
    set.add(slugify(m[1]));
  }
  return set;
}

/**
 * @param {string} fromFile
 * @param {string} href
 * @returns {{ ok: boolean; reason?: string; target?: string; hash?: string }}
 */
function resolveLink(fromFile, href) {
  const hashIdx = href.indexOf("#");
  /** @type {string} */
  let pathPart = href;
  /** @type {string | undefined} */
  let hash;
  if (hashIdx !== -1) {
    pathPart = href.slice(0, hashIdx);
    hash = href.slice(hashIdx + 1);
  }
  const clean = pathPart.split("?")[0]?.trim() ?? "";
  if (clean.length === 0) {
    return { ok: true, hash };
  }
  if (clean.startsWith("http") || clean.startsWith("mailto:")) {
    return { ok: true };
  }
  const target = clean.startsWith("/")
    ? path.join(root, clean.slice(1))
    : path.resolve(path.dirname(fromFile), clean);
  if (!existsSync(target)) {
    return { ok: false, reason: "missing file" };
  }
  return { ok: true, target, hash };
}

/**
 * @param {string} dirAbs
 * @returns {Promise<string[]>}
 */
async function walkMd(dirAbs) {
  if (!existsSync(dirAbs)) return [];
  const entries = await readdir(dirAbs, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter(
        (ent) =>
          ent.isDirectory() &&
          !ent.name.startsWith(".") &&
          ent.name !== "node_modules"
      )
      .map(async (ent) => walkMd(path.join(dirAbs, ent.name)))
  );
  const files = entries
    .filter((ent) => ent.isFile() && ent.name.endsWith(".md"))
    .map((ent) => path.join(dirAbs, ent.name));
  return [...files, ...nested.flat()];
}

/**
 * @param {string} absPath
 * @param {{ failLevel: "warn" | "fail"; checkLength?: boolean }} opts
 */
async function checkMarkdownFile(absPath, opts) {
  const rel = path.relative(root, absPath);
  const text = await readFile(absPath, "utf-8");
  const anchors = collectAnchors(text);
  const lines = text.split("\n").length;

  if (opts.checkLength) {
    const allow =
      text.includes("<!-- docs:allow-length -->") ||
      rel === "docs/explanation/scenarios.md";
    if (!allow) {
      if (lines > 250) {
        note(
          failLength ? "fail" : "warn",
          `${rel}: >250 lines (${lines})${failLength ? "" : " [warn until D6]"}`
        );
      } else if (lines > 180) {
        note("warn", `${rel}: >180 lines (${lines})`);
      }
    }
  }

  /** @type {{ href: string; resolved: ReturnType<typeof resolveLink> }[]} */
  const external = [];
  for (const m of text.matchAll(MD_LINK)) {
    const href = m[2]?.trim() ?? "";
    if (!href || href.startsWith("http") || href.startsWith("mailto:"))
      continue;

    if (href.startsWith("#")) {
      const slug = slugify(href.slice(1).replaceAll("-", " ")) || href.slice(1);
      const frag = href.slice(1).toLowerCase();
      if (!(anchors.has(frag) || anchors.has(slug))) {
        note(opts.failLevel, `${rel}: broken anchor → ${href}`);
      }
      continue;
    }

    const resolved = resolveLink(absPath, href);
    if (!resolved.ok) {
      note(opts.failLevel, `${rel}: broken link → ${href}`);
      continue;
    }
    if (resolved.hash && resolved.target) {
      external.push({ href, resolved });
    }
  }

  const uniqueTargets = [
    ...new Set(external.map((e) => e.resolved.target).filter(Boolean)),
  ];
  /** @type {Map<string, Set<string>>} */
  const anchorByTarget = new Map();
  await Promise.all(
    uniqueTargets.map(async (target) => {
      if (!target) return;
      const targetText = await readFile(target, "utf-8");
      anchorByTarget.set(target, collectAnchors(targetText));
    })
  );

  for (const { href, resolved } of external) {
    const target = resolved.target;
    const hash = resolved.hash;
    if (!(target && hash)) continue;
    const targetAnchors = anchorByTarget.get(target);
    const frag = hash.toLowerCase();
    if (!targetAnchors?.has(frag)) {
      note(
        opts.failLevel,
        `${rel}: broken anchor → ${href} (no #${hash} in ${path.relative(root, target)})`
      );
    }
  }
}

async function checkReadmeIndex() {
  const readmePath = path.join(root, "docs/README.md");
  if (!existsSync(readmePath)) {
    note("fail", "docs/README.md missing");
    return;
  }
  const readme = await readFile(readmePath, "utf-8");
  const leaves = await walkMd(path.join(root, "docs"));
  for (const abs of leaves) {
    const rel = path.relative(root, abs).replaceAll("\\", "/");
    if (rel === "docs/README.md") continue;
    const fromDocs = path
      .relative(path.join(root, "docs"), abs)
      .replaceAll("\\", "/");
    const patterns = [
      fromDocs,
      fromDocs.replace(/\.md$/, ""),
      path.basename(abs),
    ];
    const listed = patterns.some(
      (p) =>
        readme.includes(`](${p})`) ||
        readme.includes(`](${p}.md)`) ||
        readme.includes(`\`${p}\``) ||
        readme.includes(`\`${rel}\``)
    );
    if (!listed) {
      note("warn", `docs/README.md: leaf not indexed → ${rel}`);
    }
  }
}

async function main() {
  const docLeaves = await walkMd(path.join(root, "docs"));

  await Promise.all(
    docLeaves.map(async (f) =>
      checkMarkdownFile(f, { failLevel: "fail", checkLength: true })
    )
  );

  const rootMd = ["README.md", "ROADMAP.md", "CLAUDE.md"]
    .map((n) => path.join(root, n))
    .filter((p) => existsSync(p));
  await Promise.all(
    rootMd.map(async (f) =>
      checkMarkdownFile(f, { failLevel: "fail", checkLength: false })
    )
  );

  const agentFiles = [path.join(root, "AGENTS.md")];
  const packageAgentLists = await Promise.all(
    ["packages", "apps"].map(async (top) => {
      const abs = path.join(root, top);
      if (!existsSync(abs)) return [];
      const names = await readdir(abs);
      return names
        .map((name) => path.join(abs, name, "AGENTS.md"))
        .filter((agents) => existsSync(agents));
    })
  );
  agentFiles.push(...packageAgentLists.flat());
  await Promise.all(
    agentFiles.map(async (f) =>
      checkMarkdownFile(f, { failLevel: "fail", checkLength: false })
    )
  );

  await checkReadmeIndex();

  let warns = 0;
  let fails = 0;
  for (const { level, msg } of findings) {
    if (level === "fail") {
      fails += 1;
      console.error(`FAIL  ${msg}`);
    } else {
      warns += 1;
      console.warn(`WARN  ${msg}`);
    }
  }

  console.log(
    `check:docs: ${findings.length} finding(s) (${fails} fail, ${warns} warn)${strict ? " [strict]" : " [warn-only exit]"}`
  );

  if (strict && fails > 0) process.exit(1);
  if (!strict) process.exit(0);
  process.exit(fails > 0 ? 1 : 0);
}

await main();

#!/usr/bin/env node
/**
 * Advisory per-PR report of test-quality movement: mocks, assertions, casts and sleeps
 * added or removed in test files between a base and a head. It never fails: a reviewer
 * reads it next to the diff (CI writes it to the job summary). The enforcing side is the
 * shrink-only baselines (`watchdog/no-internal-module-mock`, `no-test-casts`,
 * `no-test-sleep`); this report also shows what they cannot see, such as a deleted
 * `expect(` or a new mock of a package.
 *
 *   node scripts/test-diff-report.mjs <base> [head]    (default head: HEAD)
 *
 * Compares `<base>...<head>` (merge base to head), the same range a pull request shows.
 */
import { spawnSync } from "node:child_process";

const TEST_FILE = /(?:^|\/)__tests__\/|\.(?:test|spec)\.[cm]?[jt]sx?$/;

/** What each column counts, matched per added or removed source line. */
const METRICS = [
  { key: "mocks", label: "vi.mock calls", re: /\bvi\.(?:mock|doMock)\(/ },
  { key: "asserts", label: "expect( assertions", re: /\bexpect\(/ },
  {
    key: "casts",
    label: "`as never` / `as unknown as` casts",
    re: /\bas never\b|\bas unknown as\b/,
  },
  {
    key: "sleeps",
    label: "setTimeout / sleep / delay calls",
    re: /\b(?:setTimeout|sleep|delay)\(/,
  },
];

const [base, head = "HEAD"] = process.argv.slice(2);
if (!base) {
  console.error("usage: node scripts/test-diff-report.mjs <base> [head]");
  process.exit(2);
}

const diff = spawnSync(
  "git",
  ["diff", "--unified=0", "--no-color", "--no-ext-diff", `${base}...${head}`],
  { encoding: "utf-8", maxBuffer: 256 * 1024 * 1024 }
);
if (diff.status !== 0 || typeof diff.stdout !== "string") {
  // `stderr` is null when git could not be spawned at all; then `error` says why.
  const why = diff.error?.message ?? (diff.stderr ?? "").trim();
  console.log(
    `## Test mock report\n\nSkipped: \`git diff ${base}...${head}\` failed (${why === "" ? "no output" : why}).`
  );
  process.exit(0);
}

const zero = () =>
  Object.fromEntries(
    METRICS.flatMap((m) => [
      [`${m.key}+`, 0],
      [`${m.key}-`, 0],
    ])
  );
/** @type {Map<string, Record<string, number>>} */
const perFile = new Map();
let file = null;
for (const line of diff.stdout.split("\n")) {
  if (line.startsWith("--- ")) {
    // The old name starts a file's block; a deleted file has no `+++` name, so its
    // removed lines belong to this one.
    const name = line.slice(4).replace(/^a\//, "");
    file = TEST_FILE.test(name) ? name : null;
    continue;
  }
  if (line.startsWith("+++ ")) {
    const name = line.slice(4).replace(/^b\//, "");
    if (name !== "/dev/null") file = TEST_FILE.test(name) ? name : null;
    continue;
  }
  if (file === null || !(line.startsWith("+") || line.startsWith("-")))
    continue;
  const sign = line.charAt(0);
  const text = line.slice(1);
  for (const m of METRICS) {
    if (!m.re.test(text)) continue;
    const row = perFile.get(file) ?? zero();
    row[`${m.key}${sign}`] += 1;
    perFile.set(file, row);
  }
}

/** @param {string} key */
const total = (key) =>
  [...perFile.values()].reduce((sum, row) => sum + (row[key] ?? 0), 0);
const signed = (n) => (n > 0 ? `+${n}` : String(n));

const rows = METRICS.map((m) => {
  const added = total(`${m.key}+`);
  const removed = total(`${m.key}-`);
  return `| ${m.label} | ${added} | ${removed} | ${signed(added - removed)} |`;
});
const out = [
  "## Test mock report (advisory)",
  "",
  `Test files compared: \`${base}...${head}\`, ${perFile.size} with a counted change. Counts are changed lines, not semantics.`,
  "",
  "| Metric | Added | Removed | Net |",
  "| --- | ---: | ---: | ---: |",
  ...rows,
  "",
];

const flagged = [];
for (const [name, row] of [...perFile].sort(([a], [b]) => a.localeCompare(b))) {
  const notes = [];
  if (row["mocks+"] > row["mocks-"])
    notes.push(`mocks ${signed(row["mocks+"] - row["mocks-"])}`);
  if (row["asserts-"] > row["asserts+"])
    notes.push(`assertions ${signed(row["asserts+"] - row["asserts-"])}`);
  if (row["casts+"] > row["casts-"])
    notes.push(`casts ${signed(row["casts+"] - row["casts-"])}`);
  if (row["sleeps+"] > row["sleeps-"])
    notes.push(`sleeps ${signed(row["sleeps+"] - row["sleeps-"])}`);
  if (notes.length > 0) flagged.push(`- \`${name}\`: ${notes.join(", ")}`);
}
if (flagged.length > 0) {
  out.push(
    "Files that added mocks, casts or sleeps, or removed more assertions than they added:",
    "",
    ...flagged,
    ""
  );
} else {
  out.push(
    "No test file added a mock, cast or sleep, or lost an assertion.",
    ""
  );
}
out.push(
  "Policy: `docs/contributing/testing/standards.md` (Mock policy). This report never fails the build."
);
console.log(out.join("\n"));

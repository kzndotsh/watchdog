import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CONFIRMED_REQUIRES_EVIDENCE } from "../confirmed-evidence.ts";
import {
  CONFIRMED_REFUSED_MESSAGE,
  USER_OVERRIDE_REQUIRED_MESSAGE,
} from "../custody-child-write.ts";

/**
 * Guards: message texts live in exactly one policy module each. Anything else imports the
 * constant from `@watchdog/policy`.
 *
 * - "confirmed requires Evidence": `packages/policy/src/confirmed-evidence.ts`
 * - child-write custody messages: `packages/policy/src/custody-child-write.ts`
 */
interface Rule {
  name: string;
  literals: readonly string[];
  ownModule: string;
}

const EVIDENCE_RULE: Rule = {
  name: "confirmed requires Evidence",
  literals: [
    CONFIRMED_REQUIRES_EVIDENCE,
    "confirmed requires at least",
    "confirmed requires evidence",
  ],
  ownModule: "packages/policy/src/confirmed-evidence.ts",
};

const CHILD_WRITE_RULE: Rule = {
  name: "child-write custody messages",
  literals: [USER_OVERRIDE_REQUIRED_MESSAGE, CONFIRMED_REFUSED_MESSAGE],
  ownModule: "packages/policy/src/custody-child-write.ts",
};

const SOURCE_FILE = /\.(?:[cm]?[jt]sx?)$/;
const IGNORED =
  /(?:^|\/)(?:__tests__|generated|node_modules|dist|\.git|_legacy-v2)\/|\.(?:test|spec|gen)\.[cm]?[jt]sx?$|(?:^|\/)e2e\//;
const WALK_SKIPPED_DIRS = new Set(["node_modules", "dist", ".git"]);

/** Case-insensitive: a re-cased copy of the message is still a second copy. */
function findForbiddenLiteral(
  text: string,
  literals: readonly string[]
): string | undefined {
  const haystack = text.toLowerCase();
  return literals.find((literal) => haystack.includes(literal.toLowerCase()));
}

function gitTrackedFiles(root: string): string[] {
  return execFileSync("git", ["ls-files", "apps", "packages"], {
    cwd: root,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "ignore"],
  })
    .split("\n")
    .filter(Boolean);
}

function walkFiles(root: string, dir: string): string[] {
  const out: string[] = [];
  let entries: import("node:fs").Dirent[];
  try {
    entries = readdirSync(path.join(root, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!WALK_SKIPPED_DIRS.has(entry.name)) out.push(...walkFiles(root, rel));
    } else if (entry.isFile()) {
      out.push(rel);
    }
  }
  return out;
}

/** Source files under apps/ and packages/ (own modules included); never throws. */
function listSourceFiles(
  root: string,
  lister: (root: string) => string[] = gitTrackedFiles
): string[] {
  let files: string[];
  try {
    files = lister(root);
  } catch {
    files = [...walkFiles(root, "apps"), ...walkFiles(root, "packages")];
  }
  return files.filter((file) => SOURCE_FILE.test(file) && !IGNORED.test(file));
}

function offendersFor(root: string, files: string[], rule: Rule): string[] {
  return files.filter(
    (file) =>
      file !== rule.ownModule &&
      findForbiddenLiteral(
        readFileSync(path.join(root, file), "utf-8"),
        rule.literals
      ) !== undefined
  );
}

const repoRoot = path.resolve(import.meta.dirname, "../../../..");

describe("message literal scanner", () => {
  it("flags the message and the old literals (must-fail fixture)", () => {
    const { literals } = EVIDENCE_RULE;
    expect(
      findForbiddenLiteral(`reason: "${CONFIRMED_REQUIRES_EVIDENCE}"`, literals)
    ).toBe(CONFIRMED_REQUIRES_EVIDENCE);
    expect(
      findForbiddenLiteral("confirmed requires at least 1 item", literals)
    ).toBe("confirmed requires at least");
    expect(findForbiddenLiteral("confirmed requires evidence", literals)).toBe(
      "confirmed requires evidence"
    );
    expect(
      findForbiddenLiteral("import { CONFIRMED_REQUIRES_EVIDENCE }", literals)
    ).toBe(undefined);
  });

  it("matches case-insensitively", () => {
    expect(
      findForbiddenLiteral(
        "Confirmed Requires Evidence",
        EVIDENCE_RULE.literals
      )
    ).toBe("confirmed requires evidence");
    expect(
      findForbiddenLiteral(
        USER_OVERRIDE_REQUIRED_MESSAGE.toUpperCase(),
        CHILD_WRITE_RULE.literals
      )
    ).toBe(USER_OVERRIDE_REQUIRED_MESSAGE);
  });

  it("flags the child-write messages and leaves their constant names alone", () => {
    expect(
      findForbiddenLiteral(
        `fail("${CONFIRMED_REFUSED_MESSAGE}")`,
        CHILD_WRITE_RULE.literals
      )
    ).toBe(CONFIRMED_REFUSED_MESSAGE);
    expect(
      findForbiddenLiteral(
        "import { USER_OVERRIDE_REQUIRED_MESSAGE, CONFIRMED_REFUSED_MESSAGE }",
        CHILD_WRITE_RULE.literals
      )
    ).toBe(undefined);
  });

  it("scans .mjs and .js sources, not tests or generated files", () => {
    const files = ["a/x.mjs", "a/y.js", "a/z.cjs", "a/w.tsx", "a/doc.md"];
    expect(listSourceFiles("/unused", () => files)).toEqual([
      "a/x.mjs",
      "a/y.js",
      "a/z.cjs",
      "a/w.tsx",
    ]);
    expect(
      listSourceFiles("/unused", () => [
        "a/__tests__/x.ts",
        "a/x.test.mjs",
        "a/generated/x.js",
        "a/x.gen.ts",
        "a/e2e/x.ts",
      ])
    ).toEqual([]);
  });

  it("finds an .mjs offender in a fixture tree", () => {
    const root = mkdtempSync(path.join(tmpdir(), "literal-guard-"));
    try {
      mkdirSync(path.join(root, "packages/x"), { recursive: true });
      writeFileSync(
        path.join(root, "packages/x/script.mjs"),
        `console.log("Confirmed REQUIRES evidence")`
      );
      const files = listSourceFiles(root, () => ["packages/x/script.mjs"]);
      expect(offendersFor(root, files, EVIDENCE_RULE)).toEqual([
        "packages/x/script.mjs",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("falls back to walking the filesystem when git fails, skipping vendored dirs", () => {
    const root = mkdtempSync(path.join(tmpdir(), "literal-guard-"));
    try {
      for (const file of [
        "apps/web/a.ts",
        "packages/core/b.mjs",
        "packages/core/node_modules/dep/c.ts",
        "packages/core/dist/d.js",
        "packages/core/.git/e.ts",
        "packages/core/notes.md",
      ]) {
        mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        writeFileSync(path.join(root, file), "");
      }
      const files = listSourceFiles(root, () => {
        throw new Error("not a git checkout");
      });
      expect([...files].sort()).toEqual([
        "apps/web/a.ts",
        "packages/core/b.mjs",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not throw when neither git nor the directories exist", () => {
    const root = mkdtempSync(path.join(tmpdir(), "literal-guard-"));
    try {
      expect(
        listSourceFiles(root, () => {
          throw new Error("no git");
        })
      ).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("message literals live only in their policy module", () => {
  const files = listSourceFiles(repoRoot);

  it("scanned the policy modules and files under apps/web and packages/core", () => {
    expect(files).toContain(EVIDENCE_RULE.ownModule);
    expect(files).toContain(CHILD_WRITE_RULE.ownModule);
    expect(files.some((file) => file.startsWith("apps/web/"))).toBe(true);
    expect(files.some((file) => file.startsWith("packages/core/"))).toBe(true);
  });

  for (const rule of [EVIDENCE_RULE, CHILD_WRITE_RULE]) {
    it(`${rule.name}: appears in no source file outside ${rule.ownModule} and tests`, () => {
      expect(offendersFor(repoRoot, files, rule)).toEqual([]);
    });
  }
});

/**
 * Doc-affect map (SoT). Code globs → docs that should be touched in the same
 * commit. Consumed by check-docs-affected.mjs.
 *
 * Only `strict: true` rules run in the wired stages (commit-msg and CI use
 * `--strict --strict-only`); the others are advisory in a manual
 * `pnpm check:docs-affected` run. A rule needs a doc that stays useful to
 * maintain: do not map code to a registry or index that duplicates the code.
 * Docs that no longer exist are skipped, and a rule with none left is inert.
 *
 * Escape hatch: the commit's own message (commit-msg stage) or PR body containing
 * `docs:allow-affect — <reason>` (reason required).
 */

/** @typedef {{ id: string; code: RegExp[]; docs: string[]; strict: boolean; note?: string }} DocMapRule */

/** @type {DocMapRule[]} */
export const DOC_MAP = [
  {
    id: "design",
    code: [
      /^apps\/web\/src\/styles\/wd-.*\.css$/,
      /^scripts\/check-design-tokens\.mjs$/,
    ],
    docs: ["DESIGN.md"],
    strict: false,
    note: "Token or weight changes should be reflected in DESIGN.md",
  },
  {
    id: "auth",
    code: [/^packages\/auth\//],
    docs: ["packages/auth/AGENTS.md", "docs/how-to/auth-setup.md"],
    strict: false,
  },
  {
    id: "caps",
    code: [/^packages\/caps\//],
    docs: [
      "docs/reference/platform/caps-lexicon.md",
      "packages/caps/AGENTS.md",
    ],
    strict: true,
  },
  {
    id: "e2e",
    code: [
      /^e2e\//,
      /^playwright\.config\.ts$/,
      /^vitest\.(config|reset-modules)/,
    ],
    docs: ["docs/contributing/testing/"],
    strict: true,
  },
  {
    id: "domains-hooks-lib",
    code: [/^apps\/web\/src\/domains\/.+\/(hooks|lib)\//],
    docs: ["docs/reference/web/domains.md"],
    strict: false,
    note: "Fires only for new/changed files under domains/*/hooks|lib/",
  },
  {
    id: "api-client",
    code: [/^packages\/api\//, /^packages\/client\//],
    docs: [
      "docs/reference/platform/jobs-orpc.md",
      "docs/how-to/agent-cli.md",
      "packages/client/AGENTS.md",
    ],
    strict: false,
    note: "Skip when only packages/client/src/generated/ changes",
  },
  {
    id: "cli",
    code: [/^apps\/cli\//],
    docs: ["docs/how-to/agent-cli.md", "apps/cli/AGENTS.md"],
    strict: true,
  },
  {
    id: "e2e-journey",
    code: [/^e2e\/specs\/journeys\//],
    docs: ["docs/tutorials/first-investigation.md"],
    strict: false,
    note: "Core loop e2e should stay aligned with the tutorial",
  },
];

/**
 * @param {string} rel
 * @returns {boolean}
 */
export function isGeneratedClientOnly(rel) {
  return rel.startsWith("packages/client/src/generated/");
}

/**
 * @param {string[]} changedRelPaths
 * @returns {{ rule: DocMapRule; matchedCode: string[] }[]}
 */
export function matchRules(changedRelPaths) {
  /** @type {{ rule: DocMapRule; matchedCode: string[] }[]} */
  const hits = [];
  for (const rule of DOC_MAP) {
    if (rule.id === "api-client") {
      const nonGenerated = changedRelPaths.filter(
        (p) =>
          (p.startsWith("packages/api/") || p.startsWith("packages/client/")) &&
          !isGeneratedClientOnly(p)
      );
      if (nonGenerated.length === 0) continue;
      hits.push({ rule, matchedCode: nonGenerated });
      continue;
    }
    const matchedCode = changedRelPaths.filter((p) =>
      rule.code.some((re) => re.test(p))
    );
    if (matchedCode.length === 0) continue;
    hits.push({ rule, matchedCode });
  }
  return hits;
}

/**
 * @param {string} text
 * @returns {boolean}
 */
export function hasAllowAffect(text) {
  return /docs:allow-affect\s*[\u2014\u2013-][^\S\n]*\S/i.test(text);
}

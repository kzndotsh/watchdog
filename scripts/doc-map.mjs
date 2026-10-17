/**
 * Doc-affect map (SoT). Code globs → docs that should be touched in the same
 * commit. Consumed by check-docs-affected.mjs, which fails at commit-msg and in
 * CI for every rule here. A rule needs a doc that stays useful to maintain: do
 * not map code to a registry or index that duplicates the code, and do not add
 * an advisory rule (nothing reads a warning). Docs that no longer exist are
 * skipped, and a rule with none left is inert.
 *
 * Escape hatch: the commit's own message (commit-msg stage) or PR body containing
 * `docs:allow-affect — <reason>` (reason required).
 */

/** @typedef {{ id: string; code: RegExp[]; docs: string[] }} DocMapRule */

/** @type {DocMapRule[]} */
export const DOC_MAP = [
  {
    id: "caps",
    code: [/^packages\/caps\//],
    docs: [
      "docs/reference/platform/caps-lexicon.md",
      "packages/caps/AGENTS.md",
    ],
  },
  {
    id: "e2e",
    code: [
      /^e2e\//,
      /^playwright\.config\.ts$/,
      /^vitest\.(config|reset-modules|leak-canary)/,
    ],
    docs: ["docs/contributing/testing/"],
  },
  {
    id: "cli",
    code: [/^apps\/cli\//],
    docs: ["docs/how-to/agent-cli.md", "apps/cli/AGENTS.md"],
  },
];

/**
 * @param {string[]} changedRelPaths
 * @returns {{ rule: DocMapRule; matchedCode: string[] }[]}
 */
export function matchRules(changedRelPaths) {
  /** @type {{ rule: DocMapRule; matchedCode: string[] }[]} */
  const hits = [];
  for (const rule of DOC_MAP) {
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
  return /docs:allow-affect\s*[—–-][^\S\n]*\S/i.test(text);
}

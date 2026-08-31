/**
 * Doc-affect map (SoT). Code globs → docs that should be touched in the same
 * commit. Consumed by check-docs-affected.mjs.
 *
 * Escape hatch: commit message (commit-msg stage) or PR body containing
 * `docs:allow-affect — <reason>`.
 */

/** @typedef {{ id: string; code: RegExp[]; docs: string[]; strict: boolean; note?: string }} DocMapRule */

/** @type {DocMapRule[]} */
export const DOC_MAP = [
  {
    id: "web-ui",
    code: [
      /^apps\/web\/src\/shared\/ui\//,
      /^apps\/web\/scripts\/ds-ban-check\.mjs$/,
    ],
    docs: [
      "docs/reference/web/ui/",
      "docs/reference/web/UI.md",
      "docs/reference/web/components.md",
    ],
    strict: true,
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
    code: [/^e2e\//, /^playwright\.config\.ts$/, /^vitest\.config/],
    docs: ["docs/contributing/testing/", "docs/contributing/testing/web.md"],
    strict: true,
  },
  {
    id: "routes-scenarios",
    code: [/^apps\/web\/src\/routes\//],
    docs: ["docs/explanation/scenarios.md"],
    strict: true,
  },
  {
    id: "domains-hooks-lib",
    code: [/^apps\/web\/src\/domains\/.+\/(hooks|lib)\//],
    docs: ["docs/reference/web/domains.md", "docs/reference/web/domains.md"],
    strict: false,
    note: "Fires only for new/changed files under domains/*/hooks|lib/",
  },
  {
    id: "api-client",
    code: [/^packages\/api\//, /^packages\/client\//],
    docs: ["docs/reference/platform/jobs-orpc.md"],
    strict: false,
    note: "Skip when only packages/client/src/generated/ changes",
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
  return /docs:allow-affect\s*[\u2014\u2013-]\s*/i.test(text);
}

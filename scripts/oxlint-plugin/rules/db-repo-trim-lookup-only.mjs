import {
  calleeName,
  REPO_CONTRACT,
  trackRepoMethod,
  TRIM_LOOKUP_METHODS,
} from "../lib/db-repo.mjs";

/** `trimmedOrUndefined` scopes a lookup key; it must not validate a written value. */
export const dbRepoTrimLookupOnly = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Allow trimmedOrUndefined in packages/db repos only inside lookup-only methods.",
    },
  },
  /** @param {{ report: (d: { node: unknown, message: string }) => void }} context */
  create(context) {
    const tracker = trackRepoMethod();
    return {
      ...tracker.visitors,
      /** @param {Record<string, unknown>} node */
      CallExpression(node) {
        if (calleeName(node) !== "trimmedOrUndefined") return;
        const method = tracker.current();
        if (method !== null && TRIM_LOOKUP_METHODS.has(method)) return;
        context.report({
          node,
          message: `trimmedOrUndefined is lookup-only in repos (allowed in: ${[...TRIM_LOOKUP_METHODS].join(", ")}): move display-string trimming to core / schemas, or add the method to TRIM_LOOKUP_METHODS in scripts/oxlint-plugin/lib/db-repo.mjs if it only scopes a lookup (${REPO_CONTRACT}).`,
        });
      },
    };
  },
};

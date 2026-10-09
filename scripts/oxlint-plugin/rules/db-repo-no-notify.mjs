import { memberName, REPO_CONTRACT } from "../lib/db-repo.mjs";

const NOTIFY = /\bpg_notify\b/;

/**
 * Repos never send a NOTIFY: only the `activity` log's AFTER INSERT trigger does, so the
 * signal rides the transaction (ADR-0005). Catches `.notify(...)`, `pg_notify` in a SQL
 * template or string, and a `pg_notify` identifier; comments are not code and stay legal.
 */
export const dbRepoNoNotify = {
  meta: {
    type: "problem",
    docs: { description: "Ban pg_notify and .notify() in packages/db repos." },
  },
  /** @param {{ report: (d: { node: unknown, message: string }) => void }} context */
  create(context) {
    const message = `Repos must not emit events: only the activity trigger notifies, so the signal is part of the transaction (ADR-0005; ${REPO_CONTRACT} rule 2).`;
    /** @param {unknown} node */
    const flag = (node) => {
      context.report({ node, message });
    };
    return {
      /** @param {Record<string, unknown>} node */
      CallExpression(node) {
        if (memberName(node.callee) === "notify") flag(node);
      },
      /** @param {{ name?: unknown }} node */
      Identifier(node) {
        if (node.name === "pg_notify") flag(node);
      },
      /** @param {{ value?: unknown }} node */
      Literal(node) {
        if (typeof node.value === "string" && NOTIFY.test(node.value)) {
          flag(node);
        }
      },
      /** @param {{ value?: { raw?: unknown } }} node */
      TemplateElement(node) {
        if (
          typeof node.value?.raw === "string" &&
          NOTIFY.test(node.value.raw)
        ) {
          flag(node);
        }
      },
    };
  },
};

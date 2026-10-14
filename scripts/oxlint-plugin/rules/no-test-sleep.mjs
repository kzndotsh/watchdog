import { isRecord } from "../lib/ast.mjs";
import { withBaseline } from "../lib/baseline.mjs";
import { propertyName } from "../lib/effect-calls.mjs";

/**
 * @typedef {{ report: (diagnostic: { node: unknown, message: string }) => void }} RuleContext
 */

const SLEEP_NAMES = new Set(["setTimeout", "sleep", "delay"]);
const GLOBALS = new Set(["globalThis", "window", "global", "timers"]);

/**
 * The name a call goes by when it is a real wait: `setTimeout(...)`, `sleep(...)`,
 * `delay(...)`, or `globalThis.setTimeout(...)` (also `window`, `global`, `timers`).
 * `Effect.sleep` is not matched: under `it.effect` it runs on the TestClock.
 * @param {Record<string, unknown>} node
 * @returns {string | null}
 */
const sleepName = (node) => {
  const { callee } = node;
  if (!isRecord(callee)) return null;
  if (callee.type === "Identifier" && typeof callee.name === "string") {
    return SLEEP_NAMES.has(callee.name) ? callee.name : null;
  }
  if (
    callee.type === "MemberExpression" &&
    isRecord(callee.object) &&
    callee.object.type === "Identifier" &&
    typeof callee.object.name === "string" &&
    GLOBALS.has(callee.object.name)
  ) {
    const name = propertyName(callee);
    return name !== null && SLEEP_NAMES.has(name) ? name : null;
  }
  return null;
};

/**
 * Bans a real wait in tests (`setTimeout`, `sleep`, `delay`): a sleep is either slow
 * synchronization or a guess at "nothing happened yet". Use fake timers
 * (`vi.useFakeTimers()` and `advanceTimersByTime`, restored in `afterEach`), the Effect
 * `TestClock`, `rendezvous` for a race, or poll real completion (`expect.poll`, `waitFor`).
 * Existing sleeps are baselined per file (shrink-only). Policy:
 * docs/contributing/testing/standards.md (Edge checklist: no `sleep()`; Mock policy).
 */
export const noTestSleep = withBaseline("no-test-sleep", {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ban real sleeps (setTimeout, sleep, delay) in tests; use fake timers, TestClock or polling.",
    },
  },
  /** @param {RuleContext} context */
  create(context) {
    return {
      /** @param {Record<string, unknown>} node */
      CallExpression(node) {
        const name = sleepName(node);
        if (name === null) return;
        context.report({
          node,
          message: `${name}() is a real wait in a test: use fake timers (vi.useFakeTimers + advanceTimersByTime), the Effect TestClock, rendezvous for a race, or poll real completion (expect.poll, waitFor) (standards.md: no sleep; Mock policy)`,
        });
      },
    };
  },
});

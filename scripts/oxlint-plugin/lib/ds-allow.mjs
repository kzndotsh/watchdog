/**
 * Escape hatch shared by the web design-system rules: `// ds:allow-<rule> - reason` on
 * the line directly above the flagged line (an em dash works too; the reason is required).
 */

const ALLOW_COMMENT_RE = /^\/\/\s*ds:allow-([\w-]+)\s*[—-]\s*.+/;

/** JavaScript line terminators. */
const LINE_BREAK_RE = /\r\n|[\n\r\u2028\u2029]/;

/**
 * @param {string} text full source text
 * @param {number} index offset into `text`
 * @returns {number} 1-based line of the offset
 */
export const lineOfOffset = (text, index) =>
  text.slice(0, index).split(LINE_BREAK_RE).length;

/**
 * @param {string} text full source text
 * @param {number} line 1-based line that carries the violation
 * @param {string} rule allow-comment rule name, e.g. `decorative`
 */
export const isLineAllowed = (text, line, rule) => {
  if (line <= 1) return false;
  const prev = text.split(LINE_BREAK_RE)[line - 2]?.trim() ?? "";
  return ALLOW_COMMENT_RE.exec(prev)?.[1] === rule;
};

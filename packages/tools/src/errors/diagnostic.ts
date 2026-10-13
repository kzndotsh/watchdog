const HTTP_STATUS_ONLY = /^HTTP \d{3}$/;

const WITHHELD = "upstream error (details withheld)";

/**
 * The part of an upstream failure that is safe to keep in a `cause` (which is
 * logged): an HTTP status, or a fixed placeholder. Free upstream text is
 * dropped on purpose: providers and network errors echo the query, URL (with
 * userinfo or tokens) or host the caller sent, and the log contract allows no
 * secrets or investigation data. The caller's input is already in the Job
 * input; a cause never needs it.
 */
export function upstreamDiagnostic(
  text: string | undefined,
  status?: number
): string {
  if (status !== undefined) return `HTTP ${status}`;
  if (text !== undefined && HTTP_STATUS_ONLY.test(text)) return text;
  return WITHHELD;
}

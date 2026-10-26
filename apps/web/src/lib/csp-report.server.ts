import "@tanstack/react-start/server-only";

/**
 * CSP violation reports (`report-uri` / `report-to`): read with a size cap, boiled
 * down to a few short fields, rate limited, and logged. The report is never echoed
 * back: every answer has an empty body.
 */

/** A browser report is a few hundred bytes; anything past this is not one. */
export const CSP_REPORT_MAX_BYTES = 8 * 1024;

/** Reports logged per window, per process; the rest are dropped without a log line. */
const CSP_REPORT_MAX_PER_WINDOW = 30;
const CSP_REPORT_WINDOW_MS = 60_000;

/** One browser can batch several reports in a request; only the first few are logged. */
const MAX_REPORTS_PER_REQUEST = 5;

const MAX_FIELD_LENGTH = 200;

export type CspViolation = {
  directive: string;
  blocked: string;
  document: string;
  source: string;
  line: number | null;
  disposition: string;
};

/** The request body as text, or `null` when it is larger than `maxBytes` (the stream is cancelled). */
export async function readCappedText(
  request: Request,
  maxBytes: number
): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (request.body === null) return "";

  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  // Leaving the loop early cancels the stream, so an oversized body is not read to the end.
  for await (const chunk of request.body) {
    received += chunk.byteLength;
    if (received > maxBytes) return null;
    text += decoder.decode(chunk, { stream: true });
  }
  return text + decoder.decode();
}

/** A URL without its query and fragment (they can hold tokens); a keyword like `inline` is kept. */
function scrub(value: unknown): string {
  if (typeof value !== "string") return "";
  let out: string;
  try {
    const url = new URL(value);
    out = url.origin === "null" ? url.protocol : `${url.origin}${url.pathname}`;
  } catch {
    // a keyword (`inline`, `eval`) or a relative value: drop any query or fragment
    [out = ""] = value.split(/[?#]/, 1);
  }
  return out.slice(0, MAX_FIELD_LENGTH);
}

function field(record: object, ...names: string[]): unknown {
  for (const name of names) {
    if (name in record) return Reflect.get(record, name);
  }
  return undefined;
}

function toViolation(record: unknown): CspViolation | null {
  if (typeof record !== "object" || record === null) return null;
  const directive = field(
    record,
    "effective-directive",
    "effectiveDirective",
    "violated-directive",
    "violatedDirective"
  );
  if (typeof directive !== "string") return null;
  const line = field(record, "line-number", "lineNumber");
  const disposition = field(record, "disposition");
  return {
    directive: directive.slice(0, MAX_FIELD_LENGTH),
    blocked: scrub(field(record, "blocked-uri", "blockedURL", "blockedUri")),
    document: scrub(
      field(record, "document-uri", "documentURL", "documentUri")
    ),
    source: scrub(field(record, "source-file", "sourceFile")),
    line: typeof line === "number" && Number.isInteger(line) ? line : null,
    disposition:
      typeof disposition === "string" ? disposition.slice(0, 16) : "enforce",
  };
}

/**
 * The violations in a report body: the legacy `{"csp-report": {...}}` object of
 * `report-uri`, or the `[{type: "csp-violation", body: {...}}]` array of the
 * Reporting API. Anything else yields none.
 */
export function parseCspReports(text: string): CspViolation[] {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return [];
  }
  const candidates: unknown[] = [];
  if (Array.isArray(json)) {
    const items: unknown[] = json;
    for (const item of items) {
      if (typeof item === "object" && item !== null && "body" in item) {
        candidates.push(item.body);
      }
    }
  } else if (
    typeof json === "object" &&
    json !== null &&
    "csp-report" in json
  ) {
    candidates.push(json["csp-report"]);
  }
  return candidates.slice(0, MAX_REPORTS_PER_REQUEST).flatMap((candidate) => {
    const violation = toViolation(candidate);
    return violation === null ? [] : [violation];
  });
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Zod probes `new Function("")` once per page load and falls back to plain parsing
 * when the page refuses it, so the policy blocks it and the browser reports it on
 * every page. A refused `eval` from the app's own bundle (`/assets/*.js`) is that
 * probe: it is not logged, so it does not use up the rate limit that real
 * violations need. An `eval` from anywhere else is still logged.
 */
export function isFirstPartyEvalProbe(violation: CspViolation): boolean {
  if (!violation.directive.startsWith("script-src")) return false;
  if (violation.blocked !== "eval") return false;
  const documentOrigin = originOf(violation.document);
  if (
    documentOrigin === null ||
    originOf(violation.source) !== documentOrigin
  ) {
    return false;
  }
  return new URL(violation.source).pathname.startsWith("/assets/");
}

/** A fixed-window counter: `take()` is true while the window has room. */
export function createReportLimiter(options: {
  max: number;
  windowMs: number;
  now?: () => number;
}): { take: () => boolean } {
  const now = options.now ?? Date.now;
  let windowStart = now();
  let count = 0;
  return {
    take() {
      const current = now();
      if (current - windowStart >= options.windowMs) {
        windowStart = current;
        count = 0;
      }
      count += 1;
      return count <= options.max;
    },
  };
}

const processLimiter = createReportLimiter({
  max: CSP_REPORT_MAX_PER_WINDOW,
  windowMs: CSP_REPORT_WINDOW_MS,
});

type ReportDeps = {
  log: (violation: CspViolation) => void;
  limiter?: { take: () => boolean };
};

/**
 * `POST /api/csp-report`: 413 over the size cap, 429 over the rate limit, 204
 * otherwise (also for a body that is not a report). Every answer is empty.
 */
export async function handleCspReport(
  request: Request,
  { log, limiter = processLimiter }: ReportDeps
): Promise<Response> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > CSP_REPORT_MAX_BYTES) {
    return new Response(null, { status: 413 });
  }
  const text = await readCappedText(request, CSP_REPORT_MAX_BYTES);
  if (text === null) return new Response(null, { status: 413 });
  // The quota counts logged violations: a body that is not a report, an oversized
  // one and the ignored eval probe use none of it.
  for (const violation of parseCspReports(text)) {
    if (isFirstPartyEvalProbe(violation)) continue;
    if (!limiter.take()) {
      return new Response(null, {
        status: 429,
        headers: { "Retry-After": String(CSP_REPORT_WINDOW_MS / 1000) },
      });
    }
    log(violation);
  }
  return new Response(null, { status: 204 });
}

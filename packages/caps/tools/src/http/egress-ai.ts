/**
 * The Job's model door, below `Egress.llmFetchFor` (`egress.ts`): which origins a model call
 * may reach, and the `fetch` it gets for the one it was admitted to.
 *
 * Admitted: the fixed Anthropic host; any public origin (through the shared `OutboundClient`,
 * so its address guard, proxy and limits apply); a private or loopback origin only when the
 * operator listed it in `WD_AI_PRIVATE_ORIGINS`. Refused: anything else, with a fixed
 * `BlockedTargetError` (`ai_origin`) that never echoes the URL. For every call a redirect is
 * refused, the byte cap and the deadline apply, and the response body is hashed, never kept.
 */
import { Effect } from "effect";

import { BlockedTargetError } from "../errors/tagged-errors";
import type { EgressLedger } from "./egress-ledger";
import { describeRequestBody } from "./egress-request-body";
import { assertAllowedTarget } from "./outbound-policy";
import type { OutboundLimits, SafeFetch } from "./safe-fetch";

/** The host of the Anthropic API: always admitted, never needs a setting. */
export const ANTHROPIC_API_ORIGIN = "https://api.anthropic.com";

/** Bounds of one model call: a structured answer is small, a slow model is not. */
const AI_LIMITS = {
  maxBytes: 8 * 1024 * 1024,
  timeoutMs: 120_000,
} as const satisfies OutboundLimits;

/** The `fetch` the AI SDK takes: `typeof fetch` as the SDK declares it (`FetchFunction`). */
export type LlmFetch = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

/** The outbound client's two doors; a private origin's is used only after admission. */
export type AiOutbound = {
  readonly fetch: SafeFetch;
  readonly fetchPrivateOrigin: SafeFetch;
};

type AiAdmission = {
  readonly origin: string;
  readonly kind: "anthropic" | "public" | "private";
};

const refused = () => new BlockedTargetError({ reason: "ai_origin" });

/** `value` as an http(s) origin, or `undefined` for anything else (userinfo included). */
function httpOrigin(value: string): string | undefined {
  try {
    const url = new URL(value);
    const http = url.protocol === "http:" || url.protocol === "https:";
    return http && url.username === "" && url.password === ""
      ? url.origin
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Decides whether a model call may go to `raw` (any URL on the origin; only its origin counts);
 * `null` when it may not. A public host name is admitted here and checked again at connect
 * time by the outbound client, which refuses a name that resolves to a private address.
 */
export function admitAiOrigin(
  raw: string,
  privateOrigins: readonly string[]
): AiAdmission | null {
  const origin = httpOrigin(raw);
  if (origin === undefined) return null;
  if (privateOrigins.some((allowed) => httpOrigin(allowed) === origin)) {
    return { origin, kind: "private" };
  }
  if (origin === ANTHROPIC_API_ORIGIN) return { origin, kind: "anthropic" };
  try {
    // A literal private address or a loopback name never reaches the client unlisted.
    assertAllowedTarget(new URL(origin));
  } catch {
    return null;
  }
  return { origin, kind: "public" };
}

/**
 * The `fetch` for one admitted origin. A request to any other origin is refused; the call is
 * recorded (when a ledger is given) with its response hash-only.
 */
export function llmFetchFor(
  outbound: AiOutbound,
  ledger: EgressLedger | undefined,
  privateOrigins: readonly string[],
  rawOrigin: string
): Effect.Effect<LlmFetch, BlockedTargetError> {
  const admitted = admitAiOrigin(rawOrigin, privateOrigins);
  if (admitted === null) return Effect.fail(refused());
  const { origin, kind } = admitted;
  const send =
    kind === "private" ? outbound.fetchPrivateOrigin : outbound.fetch;
  const fetch: LlmFetch = async (input, init) => {
    if (typeof input !== "string" && !(input instanceof URL)) {
      throw new TypeError(
        "A model call takes a URL string or URL, not a Request"
      );
    }
    const url = typeof input === "string" ? new URL(input) : input;
    if (url.origin !== origin) throw refused();
    const observer = ledger?.begin({
      method: init?.method ?? "GET",
      url,
      requestBody: await describeRequestBody(init?.body),
      bodyPolicy: "hash_only",
    });
    await observer?.written;
    return send(url, {
      ...init,
      redirect: "error",
      limits: AI_LIMITS,
      ...(observer === undefined ? {} : { observer }),
    });
  };
  return Effect.succeed(fetch);
}

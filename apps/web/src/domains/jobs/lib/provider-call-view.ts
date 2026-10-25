import type { ProviderCallBody, ProviderCallRecord } from "@watchdog/core/jobs";
import type {
  ProviderBodyReason,
  ProviderCallTransport,
} from "@watchdog/schemas/shared";

const KIB = 1024;
const MIB = KIB * 1024;

/** `321 B`, `12.3 KiB`, `1.2 MiB`: a body size as an investigator reads it. */
export function formatByteSize(bytes: number): string {
  if (bytes < KIB) return `${bytes} B`;
  if (bytes < MIB) return `${(bytes / KIB).toFixed(1)} KiB`;
  return `${(bytes / MIB).toFixed(1)} MiB`;
}

/** `120 ms`, `1.2 s`; an em dash when the call recorded no duration. */
export function formatCallDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

const TRANSPORT_LABEL: Record<ProviderCallTransport, string> = {
  http: "HTTP",
  dns: "DNS",
  tls: "TLS",
};

export function transportLabel(transport: ProviderCallTransport): string {
  return TRANSPORT_LABEL[transport];
}

const BODY_REASON_LABEL: Record<ProviderBodyReason, string> = {
  over_limit: "over the keep limit",
  over_job_budget: "over the Job's storage budget",
  hash_only: "hash only by policy",
  served_from: "served from cache",
  reader_stopped: "the reader stopped early",
  byte_cap: "the byte cap was reached",
  read_failed: "the read failed",
};

/** What came of the call, in one phrase. */
export function callOutcomeLabel(call: ProviderCallRecord): string {
  switch (call.outcome) {
    case null: {
      return "No outcome recorded";
    }
    case "served_from": {
      return "Served from cache";
    }
    case "unfinished": {
      return "Unfinished";
    }
    case "failed": {
      return call.failureReason === null
        ? "Failed"
        : `Failed (${call.failureReason})`;
    }
    case "response": {
      return call.status === null ? "Response" : String(call.status);
    }
    default: {
      return call.outcome satisfies never;
    }
  }
}

/** True when the call ended without an answer the Cap could use. */
export function isCallFailure(call: ProviderCallRecord): boolean {
  return call.outcome === "failed" || call.outcome === "unfinished";
}

/** What is kept of the response body, in one phrase, with its size. */
export function bodySummary(body: ProviderCallBody): string {
  const size = body.bytes === null ? "" : ` · ${formatByteSize(body.bytes)}`;
  const reason =
    body.reason === null ? "" : ` (${BODY_REASON_LABEL[body.reason]})`;
  switch (body.state) {
    case "none": {
      return "No body";
    }
    case "stored": {
      return `Stored${size}`;
    }
    case "hashed": {
      return `Not stored${reason}${size}`;
    }
    case "partial": {
      return `Partly read${reason}${size}`;
    }
    default: {
      return body.state satisfies never;
    }
  }
}

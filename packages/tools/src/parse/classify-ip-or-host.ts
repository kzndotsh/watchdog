import { isIP } from "node:net";

import { normalizeIp } from "../dns/reverse";
import { validationToolsError } from "../errors/tools-error";
import { normalizeHost } from "../whois/normalize";

const HOSTNAME_RE =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function ipLiteralForClassify(raw: string): string {
  if (!raw.startsWith("[") || !raw.includes("]")) return raw;
  const close = raw.indexOf("]");
  const inner = raw.slice(1, close);
  const rest = raw.slice(close + 1);
  if (rest === "") return inner;
  if (rest.startsWith(":") && /^\d+$/.test(rest.slice(1))) return inner;
  return raw;
}

/** Classify a seed as IP or domain and normalize. Throws on invalid domain. */
export function classifyIpOrHost(raw: string): {
  kind: "ip" | "domain";
  value: string;
} {
  const trimmed = raw.trim();
  const ipCandidate = ipLiteralForClassify(trimmed);
  if (isIP(ipCandidate)) {
    return { kind: "ip", value: normalizeIp(ipCandidate) };
  }
  const value = normalizeHost(trimmed);
  if (value === "" || !HOSTNAME_RE.test(value)) {
    throw validationToolsError(`Invalid hostname: ${raw}`);
  }
  return { kind: "domain", value };
}

import { normalizeEmail } from "../identity/email-lookup";
import { classifyIpOrHost } from "./classify-ip-or-host";

export type BreachQueryKind = "email" | "ip" | "domain" | "username";

/** Classify breach-corpus seeds: email → IP/domain via `classifyIpOrHost` → username. */
export function classifyBreachQuery(raw: string): {
  kind: BreachQueryKind;
  value: string;
} {
  const trimmed = raw.trim();
  if (trimmed.includes("@")) {
    try {
      const { email } = normalizeEmail(trimmed);
      return { kind: "email", value: email };
    } catch {
      return { kind: "username", value: trimmed };
    }
  }
  try {
    return classifyIpOrHost(trimmed);
  } catch {
    return { kind: "username", value: trimmed };
  }
}

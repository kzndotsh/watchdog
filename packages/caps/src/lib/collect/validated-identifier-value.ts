import {
  validateIdentifierValue,
  type IdentifierType,
} from "@watchdog/schemas";
import { canonicalIpLiteral } from "@watchdog/tools";

import { eligibleCtDomains } from "./eligible-domain-hosts";

/** Normalize + validate a draft/proposal Identifier value (collect-aligned). */
export function validatedIdentifierValue(
  type: IdentifierType,
  raw: string
): string | null {
  if (type === "domain") {
    const [host] = eligibleCtDomains([raw]);
    if (!host) return null;
    const parsed = validateIdentifierValue("domain", host);
    return parsed.ok ? parsed.value : null;
  }
  const parsed = validateIdentifierValue(type, raw);
  if (!parsed.ok) return null;
  if (type === "ip") {
    try {
      return canonicalIpLiteral(parsed.value);
    } catch {
      return null;
    }
  }
  return parsed.value;
}

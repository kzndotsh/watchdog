import { fixedContactHost } from "@watchdog/schemas/caps";

import { CAPABILITIES } from "./registry";
import type { RedistributionVerdict } from "./sdk";

export type { RedistributionVerdict };

/**
 * The verdict per contact host, collected from the `hosts` of the providers the registered Caps
 * name (see `CapProvider.hosts`). Built on first use so the registry is loaded by then.
 */
let verdicts: ReadonlyMap<string, RedistributionVerdict> | undefined;

function hostVerdicts(): ReadonlyMap<string, RedistributionVerdict> {
  if (verdicts === undefined) {
    const map = new Map<string, RedistributionVerdict>();
    const owner = new Map<string, string>();
    for (const { provider } of CAPABILITIES) {
      for (const [host, verdict] of Object.entries(provider.hosts ?? {})) {
        const other = owner.get(host);
        if (other !== undefined && other !== provider.name) {
          throw new Error(
            `Host ${host} has a verdict on two providers: ${other} and ${provider.name}`
          );
        }
        owner.set(host, provider.name);
        map.set(host, verdict);
      }
    }
    verdicts = map;
  }
  return verdicts;
}

/** The reviewed verdict of a contact host; a host no provider lists is `unknown`. */
export function redistributionVerdictFor(host: string): RedistributionVerdict {
  const key = fixedContactHost({
    kind: "provider",
    host,
    access: "anonymous",
  });
  if (key === undefined) return "unknown";
  return hostVerdicts().get(key) ?? "unknown";
}

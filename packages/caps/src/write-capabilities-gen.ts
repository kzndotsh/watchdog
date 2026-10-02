import { writeFileSync } from "node:fs";

import { listKnownCredentials } from "./known-credentials";
import { CAPABILITIES } from "./registry";
import { toCapDescriptor } from "./sdk";

/** Validate credential slots and write CapDescriptor JSON. Returns descriptor count. */
export function writeCapabilitiesGenFile(outPath: string): number {
  const known = new Set(listKnownCredentials().map((k) => k.name));
  const missingSlots = new Set<string>();
  for (const cap of CAPABILITIES) {
    for (const spec of cap.credentials ?? []) {
      if ("anyOf" in spec) {
        for (const name of spec.anyOf) {
          if (!known.has(name)) missingSlots.add(`${cap.id}:${name}`);
        }
      } else if (!known.has(spec.name)) {
        missingSlots.add(`${cap.id}:${spec.name}`);
      }
    }
  }
  if (missingSlots.size > 0) {
    throw new Error(
      `generate:caps hygiene — Cap credential(s) missing from KNOWN_CREDENTIALS:\n  ${[...missingSlots].join("\n  ")}`
    );
  }

  const descriptors = CAPABILITIES.map((c) => toCapDescriptor(c));
  writeFileSync(outPath, `${JSON.stringify(descriptors, null, 2)}\n`, "utf-8");
  return descriptors.length;
}

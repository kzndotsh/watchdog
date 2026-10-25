import { writeFileSync } from "node:fs";
import path from "node:path";

import { computeCapVersions } from "./cap-fingerprint";
import { renderCapRegister } from "./cap-register";
import { listKnownCredentials } from "./known-credentials";
import { CAPABILITIES } from "./registry";
import { toCapDescriptor, toCapMetadata, type CapDescriptor } from "./sdk";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");

/** Every Cap's descriptor, its freshly computed code fingerprint as `version`. */
export function buildCapDescriptors(root: string = REPO_ROOT): CapDescriptor[] {
  const versions = computeCapVersions(
    root,
    CAPABILITIES.map((c) => c.id)
  );
  return CAPABILITIES.map((c) => toCapDescriptor(c, versions[c.id] ?? ""));
}

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

  const descriptors = buildCapDescriptors();
  writeFileSync(outPath, `${JSON.stringify(descriptors, null, 2)}\n`, "utf-8");
  return descriptors.length;
}

/** Write the Cap register (provider, terms, tier, commercial use per Cap). */
export function writeCapRegisterFile(outPath: string): void {
  writeFileSync(
    outPath,
    renderCapRegister(CAPABILITIES.map((c) => toCapMetadata(c))),
    "utf-8"
  );
}

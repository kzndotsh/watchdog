import catalog from "../capabilities.gen.json";

type CatalogEntry = { id: string; version: string };

const entries: readonly CatalogEntry[] = catalog;
const VERSIONS: ReadonlyMap<string, string> = new Map(
  entries.map((entry) => [entry.id, entry.version])
);

/**
 * The version of a Cap's code, read from the generated catalog (`pnpm generate:caps` derives it
 * from the modules the Cap reaches, see `cap-fingerprint.ts`). Never hand-written.
 */
export function capVersion(capabilityId: string): string {
  const version = VERSIONS.get(capabilityId);
  if (version === undefined) {
    throw new Error(`Unknown Capability: ${capabilityId}`);
  }
  return version;
}

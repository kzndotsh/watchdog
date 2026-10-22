import type { CapListItem, CapProviderInfo } from "@/domains/jobs/types";

/** The credit a Cap's provider asks for, or null when its terms ask for none. */
export function capAttribution(
  caps: readonly Pick<CapListItem, "id" | "provider">[],
  capabilityId: string | undefined
): CapProviderInfo["attribution"] | null {
  if (capabilityId === undefined) return null;
  return (
    caps.find((cap) => cap.id === capabilityId)?.provider.attribution ?? null
  );
}

/* oxlint-disable react/only-export-components -- label helpers (no React components) */
import { capabilityIdLabel } from "@watchdog/schemas";

/**
 * Human label for a capability id.
 * Prefer `title` from the catalog when the parent already loaded it;
 * otherwise derive a readable fallback from the id (no I/O).
 */
export function capabilityLabel(
  capabilityId: string | null | undefined,
  title?: string | null
): string {
  if (title !== undefined && title !== null && title.trim() !== "") {
    return title.trim();
  }
  return capabilityIdLabel(capabilityId);
}

/** Presentational span — parent supplies optional catalog title. */
export function CapabilityLabel({
  capabilityId,
  title,
  className,
}: {
  capabilityId: string | null | undefined;
  title?: string | null;
  className?: string;
}) {
  const label = capabilityLabel(capabilityId, title);
  if (!label) return null;
  return <span className={className}>{label}</span>;
}

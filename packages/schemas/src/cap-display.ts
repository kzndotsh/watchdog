import { isUuidString } from "./primitives";
import { titleCase } from "./title-case";

/** Human label for cap catalog egress (wire may be boolean or string). */
export function capEgressLabel(egress: unknown): string {
  if (egress === true || egress === "third_party") return "Third party";
  if (
    egress === false ||
    egress === "none" ||
    egress === null ||
    egress === undefined ||
    egress === ""
  ) {
    return "None";
  }
  if (typeof egress === "string") return titleCase(egress);
  return "—";
}

/** Human label for a capability id without catalog I/O. */
export function capabilityIdLabel(
  capabilityId: string | null | undefined
): string {
  if (!capabilityId) return "";
  const parts = capabilityId.split(".");
  const rest = parts.slice(1).join(" ");
  return rest === "" ? capabilityId : titleCase(rest);
}

/** Human label for a playbook id without catalog I/O. */
export function playbookIdLabel(playbookId: string | null | undefined): string {
  if (!playbookId) return "";
  if (isUuidString(playbookId)) return "Playbook";
  const parts = playbookId.split(".");
  const tail = parts.slice(1).join(" ");
  const base = tail === "" ? (parts[0] ?? playbookId) : tail;
  return titleCase(base.replaceAll("-", " "));
}

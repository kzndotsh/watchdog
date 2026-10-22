import { Link } from "@tanstack/react-router";

import type { CapRequirement } from "@/domains/library/lib/cap-detail";

export type LibraryCapRequirementsProps = {
  requirements: readonly CapRequirement[];
};

/** Each key a Cap reads, marked configured or missing, with a Settings link when there are keys. */
export function LibraryCapRequirements({
  requirements,
}: LibraryCapRequirementsProps) {
  if (requirements.length === 0) return <>No keys needed.</>;
  return (
    <>
      <ul className="flex flex-col gap-1.5">
        {requirements.map((line) => (
          <li key={line.slots.join("|")}>
            <span className="font-mono text-xs break-all">
              {line.slots.join(" | ")}
            </span>
            <span className="text-muted-foreground text-xs">
              , {line.status}
            </span>
          </li>
        ))}
      </ul>
      <Link
        to="/settings"
        search={{ tab: "credentials" }}
        className="text-primary mt-1.5 block hover:underline"
      >
        Keys in Settings
      </Link>
    </>
  );
}

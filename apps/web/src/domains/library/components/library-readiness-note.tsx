import { Link } from "@tanstack/react-router";

import type { LibraryEntry } from "@/domains/library/types";

/** The line under the readiness badge: what is missing and where to fix it. */
export function LibraryReadinessNote({
  entry,
}: {
  entry: Pick<LibraryEntry, "kind" | "readiness">;
}) {
  const { readiness } = entry;
  switch (readiness.state) {
    case "needs_key": {
      return (
        <p className="text-sm">
          Needs {readiness.slots.length === 1 ? "the key" : "one of these keys"}
          : <span className="font-mono">{readiness.slots.join(" | ")}</span>.{" "}
          <Link
            to="/settings"
            search={{ tab: "credentials" }}
            className="underline underline-offset-2"
          >
            Connect it in Settings
          </Link>
        </p>
      );
    }
    case "off_by_operator": {
      return (
        <p className="text-sm">
          An operator has turned breach Caps off on this server, so this{" "}
          {entry.kind === "cap" ? "Cap" : "Playbook"} cannot run.
        </p>
      );
    }
    case "unavailable": {
      return <p className="text-sm">{readiness.reason}.</p>;
    }
    case "ready": {
      return null;
    }
    default: {
      const _exhaustive: never = readiness;
      return _exhaustive;
    }
  }
}

import { READINESS_LABELS } from "@/domains/library/lib/library-readiness";
import type {
  LibraryReadiness,
  LibraryReadinessState,
} from "@/domains/library/types";
import { StatusBadge, type DisplayStatus } from "@/shared/ui/vocab";

/** Readiness reuses the job status tones: ready is green, a missing key the warning hue. */
const READINESS_STATUS: Record<LibraryReadinessState, DisplayStatus> = {
  ready: "succeeded",
  needs_key: "blocked",
  off_by_operator: "cancelled",
  unavailable: "failed",
};

export function LibraryReadinessBadge({
  readiness,
}: {
  readiness: LibraryReadiness;
}) {
  return (
    <StatusBadge
      status={READINESS_STATUS[readiness.state]}
      className="shrink-0"
      data-readiness={readiness.state}
    >
      {READINESS_LABELS[readiness.state]}
    </StatusBadge>
  );
}

import {
  BanIcon,
  CheckIcon,
  KeyRoundIcon,
  TriangleAlertIcon,
} from "lucide-react";

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

const ICON_CLASS = "size-3";

function ReadinessIcon({ state }: { state: LibraryReadinessState }) {
  switch (state) {
    case "ready": {
      return <CheckIcon aria-hidden className={ICON_CLASS} />;
    }
    case "needs_key": {
      return <KeyRoundIcon aria-hidden className={ICON_CLASS} />;
    }
    case "off_by_operator": {
      return <BanIcon aria-hidden className={ICON_CLASS} />;
    }
    case "unavailable": {
      return <TriangleAlertIcon aria-hidden className={ICON_CLASS} />;
    }
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

export function LibraryReadinessBadge({
  readiness,
}: {
  readiness: LibraryReadiness;
}) {
  return (
    <StatusBadge
      status={READINESS_STATUS[readiness.state]}
      size="md"
      className="shrink-0"
      data-readiness={readiness.state}
    >
      <ReadinessIcon state={readiness.state} />
      {READINESS_LABELS[readiness.state]}
    </StatusBadge>
  );
}

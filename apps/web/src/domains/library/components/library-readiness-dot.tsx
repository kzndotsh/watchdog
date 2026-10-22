import { READINESS_DOT_STATUS } from "@/domains/library/lib/library-readiness";
import type { LibraryReadiness } from "@/domains/library/types";
import { StatusDot } from "@/shared/ui/status-dot";

export type LibraryReadinessDotProps = {
  readiness: LibraryReadiness;
};

/** A step's readiness as a status glyph; the row beside it already names the step. */
export function LibraryReadinessDot({ readiness }: LibraryReadinessDotProps) {
  return (
    <StatusDot
      status={READINESS_DOT_STATUS[readiness.state]}
      hasTooltip={false}
    />
  );
}

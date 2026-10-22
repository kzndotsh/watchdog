import {
  READINESS_DOT_STATUS,
  READINESS_LABELS,
} from "@/domains/library/lib/library-readiness";
import type { LibraryReadiness } from "@/domains/library/types";
import { StatusDot } from "@/shared/ui/status-dot";
import { WithTooltip } from "@/shared/ui/with-tooltip";

export type LibraryReadinessDotProps = {
  readiness: LibraryReadiness;
};

/**
 * A step's readiness as a compact glyph, named and tooltipped with its readiness ("Missing API
 * key", "Off by the operator") rather than the glyph's job status.
 */
export function LibraryReadinessDot({ readiness }: LibraryReadinessDotProps) {
  const label = READINESS_LABELS[readiness.state];
  return (
    <WithTooltip content={label} shouldWrapSpan>
      <span role="img" aria-label={label} className="inline-flex">
        <span aria-hidden className="inline-flex">
          <StatusDot
            status={READINESS_DOT_STATUS[readiness.state]}
            hasTooltip={false}
          />
        </span>
      </span>
    </WithTooltip>
  );
}

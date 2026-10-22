import { Link } from "@tanstack/react-router";
import { Fragment } from "react";

import type { CapKindChip } from "@/domains/library/lib/cap-detail";

export type LibraryKindTextProps = {
  chips: readonly CapKindChip[];
};

/** Input-kind labels, comma separated; a kind some entry takes links to `/library?kind=…`. */
export function LibraryKindText({ chips }: LibraryKindTextProps) {
  if (chips.length === 0) {
    return <span className="text-muted-foreground">Nothing</span>;
  }
  return (
    <>
      {chips.map((chip, i) => (
        <Fragment key={chip.kind}>
          {i === 0 ? "" : ", "}
          {chip.isLinked ? (
            <Link
              to="/library"
              search={{ id: undefined, kind: chip.kind }}
              className="text-primary hover:underline"
            >
              {chip.label}
            </Link>
          ) : (
            chip.label
          )}
        </Fragment>
      ))}
    </>
  );
}

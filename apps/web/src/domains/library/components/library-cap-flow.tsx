import { ArrowRightIcon } from "lucide-react";
import type { ReactNode } from "react";

import { LibraryKindText } from "@/domains/library/components/library-kind-text";
import type { CapKindChip } from "@/domains/library/lib/cap-detail";
import { LIBRARY_ENTRY_BOX_CLASS } from "@/shared/ui/library-shell";

export type LibraryCapFlowProps = {
  consumes: readonly CapKindChip[];
  produces: readonly CapKindChip[];
  /** Who runs it: the provider, or "This server". */
  runner: string;
  title: string;
};

type FlowBoxProps = { label: string; children: ReactNode };

function FlowBox({ label, children }: FlowBoxProps) {
  return (
    <div className={`${LIBRARY_ENTRY_BOX_CLASS} flex-1`}>
      <span className="text-muted-foreground text-xs">{label}</span>
      <div>{children}</div>
    </div>
  );
}

function FlowArrow() {
  return (
    <div className="text-muted-foreground flex items-center justify-center">
      <ArrowRightIcon aria-hidden className="size-3.5 rotate-90 md:rotate-0" />
    </div>
  );
}

/** What you give, the Cap (run by its provider or this server), what you get. */
export function LibraryCapFlow({
  consumes,
  produces,
  runner,
  title,
}: LibraryCapFlowProps) {
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-stretch">
      <FlowBox label="What you give">
        <LibraryKindText chips={consumes} />
      </FlowBox>
      <FlowArrow />
      <FlowBox label={runner}>
        <span className="font-medium">{title}</span>
      </FlowBox>
      <FlowArrow />
      <FlowBox label="What you get">
        <LibraryKindText chips={produces} />
      </FlowBox>
    </div>
  );
}

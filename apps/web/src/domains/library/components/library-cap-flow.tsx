import { LibraryFlowArrow } from "@/domains/library/components/library-flow-arrow";
import { LibraryFlowBox } from "@/domains/library/components/library-flow-box";
import { LibraryKindText } from "@/domains/library/components/library-kind-text";
import type { CapKindChip } from "@/domains/library/lib/cap-detail";

export type LibraryCapFlowProps = {
  consumes: readonly CapKindChip[];
  produces: readonly CapKindChip[];
  /** Who runs it: the provider, or "This server". */
  runner: string;
  title: string;
};

/** What you give, the Cap (run by its provider or this server), what you get. */
export function LibraryCapFlow({
  consumes,
  produces,
  runner,
  title,
}: LibraryCapFlowProps) {
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-stretch">
      <LibraryFlowBox className="flex-1" label="What you give">
        <LibraryKindText chips={consumes} />
      </LibraryFlowBox>
      <LibraryFlowArrow />
      <LibraryFlowBox className="flex-1" label={runner}>
        <span className="font-medium">{title}</span>
      </LibraryFlowBox>
      <LibraryFlowArrow />
      <LibraryFlowBox className="flex-1" label="What you get">
        <LibraryKindText chips={produces} />
      </LibraryFlowBox>
    </div>
  );
}

import type { ReactNode } from "react";

import type { DossierEmptyPresentation } from "@/domains/dossier/types";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/shared/ui/empty-state";
import { SectionLabel } from "@/shared/ui/section-label";

interface Props {
  title: string;
  children: ReactNode;
  empty?: boolean;
  /**
   * `inline` — muted one-liner (Overview nest).
   * `panel` — EmptyState blank-slate (dedicated tab).
   */
  emptyPresentation?: DossierEmptyPresentation;
  /** Muted one-liner when `emptyPresentation="inline"`. */
  emptyText?: string;
  /** Supporting sentence for panel EmptyState. */
  emptyDescription?: string;
  /** Plural resource noun → panel title “No {Items} Yet”. */
  emptyItems?: string;
  /** Panel CTA (max one primary). */
  emptyAction?: ReactNode;
  actions?: ReactNode;
  className?: string;
  /** Fill a flex parent (Notes tab). */
  fill?: boolean;
}

function renderSectionBody({
  empty,
  emptyPresentation,
  emptyItems,
  emptyDescription,
  emptyText,
  emptyAction,
  children,
}: Pick<
  Props,
  | "empty"
  | "emptyPresentation"
  | "emptyItems"
  | "emptyDescription"
  | "emptyText"
  | "emptyAction"
  | "children"
>): ReactNode {
  if (empty !== true) {
    return children;
  }
  if (emptyPresentation === "panel") {
    return (
      <EmptyState
        framed
        intent="blank-slate"
        items={emptyItems ?? "items"}
        description={emptyDescription ?? emptyText}
        action={emptyAction}
        className="min-h-0 flex-1"
      />
    );
  }
  return <p className="text-copy-sm text-muted-foreground">{emptyText}</p>;
}

export function DossierSection({
  title,
  children,
  empty,
  emptyPresentation = "inline",
  emptyText = "None recorded",
  emptyDescription,
  emptyItems = "items",
  emptyAction,
  actions,
  className,
  fill = false,
}: Props) {
  const panelEmpty = empty === true && emptyPresentation === "panel";
  const body = renderSectionBody({
    empty,
    emptyPresentation,
    emptyItems,
    emptyDescription,
    emptyText,
    emptyAction,
    children,
  });

  return (
    <section
      className={cn(
        "flex flex-col gap-2",
        (panelEmpty || fill) && "min-h-0 flex-1",
        className
      )}
    >
      <div className="flex h-6 shrink-0 items-center justify-between gap-2">
        <SectionLabel
          as="h3"
          className="m-0 text-base leading-none font-medium"
        >
          {title}
        </SectionLabel>
        {actions}
      </div>
      {fill ? <div className="flex min-h-0 flex-1 flex-col">{body}</div> : body}
    </section>
  );
}

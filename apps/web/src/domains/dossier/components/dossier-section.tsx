import type { ReactNode } from "react";

import type { DossierEmptyPresentation } from "@/domains/dossier/types";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/shared/ui/empty-state";
import { SectionLabel } from "@/shared/ui/section-label";

type Props = {
  title: string;
  children: ReactNode;
  isEmpty?: boolean;
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
  shouldFill?: boolean;
};

function renderSectionBody({
  isEmpty,
  emptyPresentation,
  emptyItems,
  emptyDescription,
  emptyText,
  emptyAction,
  children,
}: Pick<
  Props,
  | "isEmpty"
  | "emptyPresentation"
  | "emptyItems"
  | "emptyDescription"
  | "emptyText"
  | "emptyAction"
  | "children"
>): ReactNode {
  if (isEmpty !== true) {
    return children;
  }
  if (emptyPresentation === "panel") {
    return (
      <EmptyState
        isFramed
        intent="blank-slate"
        items={emptyItems ?? "items"}
        description={emptyDescription ?? emptyText}
        action={emptyAction}
        className="min-h-0 flex-1"
      />
    );
  }
  return (
    <p className="text-muted-foreground text-sm leading-normal">{emptyText}</p>
  );
}

export function DossierSection({
  title,
  children,
  isEmpty,
  emptyPresentation = "inline",
  emptyText = "None recorded",
  emptyDescription,
  emptyItems = "items",
  emptyAction,
  actions,
  className,
  shouldFill = false,
}: Props) {
  const panelEmpty = isEmpty === true && emptyPresentation === "panel";
  const body = renderSectionBody({
    isEmpty,
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
        (panelEmpty || shouldFill) && "min-h-0 flex-1",
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
      {shouldFill ? (
        <div className="flex min-h-0 flex-1 flex-col">{body}</div>
      ) : (
        body
      )}
    </section>
  );
}

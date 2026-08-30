import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { useHydrated } from "@/shared/hooks/use-hydrated";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/shared/ui/shadcn/resizable";

export interface SplitViewProps {
  /** Queue column. */
  list: ReactNode;
  /** Detail column. */
  detail: ReactNode;
  /** Optional middle column (e.g. directory between category + detail). */
  middle?: ReactNode;
  /** Where the Queue sits. Default start (left). */
  listSide?: "start" | "end";
  /**
   * Unique id for this split — namespaces vendor panel IDs so different split
   * pages don't share internal size caches. Defaults to "default".
   */
  groupId?: string;
  listDefaultSize?: string;
  listMinSize?: string;
  listMaxSize?: string;
  middleDefaultSize?: string;
  middleMinSize?: string;
  middleMaxSize?: string;
  detailMinSize?: string;
  /** Rounded border chrome (Collect/Triage). Off for full-bleed shells. */
  bordered?: boolean;
  className?: string;
}

function ColumnShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      {children}
    </div>
  );
}

/** Parse percentage size string — used to compute the Detail column remainder. */
function pct(s: string): number {
  return Number(s.replace("%", ""));
}

/**
 * Shared Queue↔Detail resizable split.
 * Used by Collect, Triage, Corpus, Alerts, Playbooks, etc.
 *
 * Sizes must be strings without units — react-resizable-panels v4 interprets
 * bare strings as percentages and numbers as pixels.
 */
export function SplitView({
  list,
  detail,
  middle,
  listSide = "start",
  groupId = "default",
  listDefaultSize = "34%",
  listMinSize = "22%",
  listMaxSize = "55%",
  middleDefaultSize = "40%",
  middleMinSize = "25%",
  middleMaxSize = "60%",
  detailMinSize = "30%",
  bordered = true,
  className,
}: SplitViewProps) {
  const hydrated = useHydrated();

  const groupClass = cn(
    "min-h-0 flex-1 overflow-hidden",
    bordered && "border-border rounded-md border",
    className
  );

  // Before JS hydrates, render a plain flex layout at the correct sizes
  // so there's no jump when react-resizable-panels takes over.
  if (!hydrated) {
    const listPct = pct(listDefaultSize);
    const detailPct = 100 - listPct;
    return (
      <div
        className={cn(
          "flex min-h-0 flex-1 overflow-hidden",
          bordered && "border-border rounded-md border",
          className
        )}
      >
        <div
          style={{
            flexBasis: `${listPct}%`,
            flexShrink: 0,
            overflow: "hidden",
          }}
          className="flex min-h-0 flex-col"
        >
          <ColumnShell>{list}</ColumnShell>
        </div>
        <div className="bg-border w-px shrink-0" />
        <div
          style={{
            flexBasis: `${detailPct}%`,
            flexGrow: 1,
            overflow: "hidden",
          }}
          className="flex min-h-0 flex-col"
        >
          <ColumnShell>{detail}</ColumnShell>
        </div>
      </div>
    );
  }

  const detailDefault = middle
    ? String(100 - pct(listDefaultSize) - pct(middleDefaultSize))
    : String(100 - pct(listDefaultSize));

  const listPanel = (
    <ResizablePanel
      id={`${groupId}-list`}
      defaultSize={listDefaultSize}
      minSize={listMinSize}
      maxSize={listMaxSize}
      className="flex min-h-0 flex-col"
    >
      <ColumnShell>{list}</ColumnShell>
    </ResizablePanel>
  );

  const middlePanel = middle ? (
    <ResizablePanel
      id={`${groupId}-middle`}
      defaultSize={middleDefaultSize}
      minSize={middleMinSize}
      maxSize={middleMaxSize}
      className="flex min-h-0 flex-col"
    >
      <ColumnShell>{middle}</ColumnShell>
    </ResizablePanel>
  ) : null;

  const detailPanel = (
    <ResizablePanel
      id={`${groupId}-detail`}
      defaultSize={detailDefault}
      minSize={detailMinSize}
      className="flex min-h-0 flex-col"
    >
      <ColumnShell>{detail}</ColumnShell>
    </ResizablePanel>
  );

  if (middlePanel) {
    return (
      <ResizablePanelGroup orientation="horizontal" className={groupClass}>
        {listPanel}
        <ResizableHandle withHandle />
        {middlePanel}
        <ResizableHandle withHandle />
        {detailPanel}
      </ResizablePanelGroup>
    );
  }

  return (
    <ResizablePanelGroup orientation="horizontal" className={groupClass}>
      {listSide === "start" ? listPanel : detailPanel}
      <ResizableHandle withHandle />
      {listSide === "start" ? detailPanel : listPanel}
    </ResizablePanelGroup>
  );
}

import { ChevronLeftIcon } from "lucide-react";
import { useState, type MouseEvent, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { useHydrated } from "@/shared/hooks/use-hydrated";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@watchdog/ui/components/resizable";

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
  /**
   * Outer box around Queue+Detail. Off by default — the handle is the divider.
   */
  bordered?: boolean;
  /** Narrow viewports: label of the back control above Detail. Default "Back". */
  backLabel?: string;
  className?: string;
  /**
   * Run edge to edge of the page inset (undoes Page's side + bottom padding), so Queue and
   * Detail touch the sidebar and the window edge. On by default.
   */
  bleed?: boolean;
}

/**
 * Page pads px-3 (sm:px-4) and pb-3 (sm:pb-4). A wrapper carries the negative margins: the
 * panel group sets its own inline width, so margins on the group itself cannot widen it.
 */
const SPLIT_BLEED_CLASS = "-mx-3 -mb-3 sm:-mx-4 sm:-mb-4";

function ColumnShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      {children}
    </div>
  );
}

/**
 * Narrow viewports (< 768px): one column at a time. Queue first; tapping a
 * Queue row shows Detail with a back control. Auto-selection (URL sync) does
 * not flip the view — only a row activation inside the Queue does.
 */
function StackedSplit({
  list,
  detail,
  backLabel,
  className,
}: {
  list: ReactNode;
  detail: ReactNode;
  backLabel: string;
  className?: string;
}) {
  const [pane, setPane] = useState<"list" | "detail">("list");

  function handleListClick(event: MouseEvent<HTMLDivElement>) {
    if (
      event.target instanceof Element &&
      event.target.closest('[data-slot="queue-row"]')
    ) {
      setPane("detail");
    }
  }

  if (pane === "list") {
    return (
      // oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- delegated: rows own their own keyboard activation (Enter/Space → click)
      <div
        data-slot="split-view"
        data-layout="stacked"
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-hidden",
          className
        )}
        onClickCapture={handleListClick}
      >
        <ColumnShell>{list}</ColumnShell>
      </div>
    );
  }

  return (
    <div
      data-slot="split-view"
      data-layout="stacked"
      className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", className)}
    >
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground border-border flex h-10 shrink-0 items-center gap-1 border-b px-3 text-sm"
        onClick={() => {
          setPane("list");
        }}
      >
        <ChevronLeftIcon aria-hidden className="size-4" />
        {backLabel}
      </button>
      <ColumnShell>{detail}</ColumnShell>
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
function SplitViewPanes({
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
  bordered = false,
  backLabel = "Back",
  className,
}: Omit<SplitViewProps, "bleed">) {
  const hydrated = useHydrated();
  const narrow = useIsMobile();

  if (hydrated && narrow && !middle) {
    return (
      <StackedSplit
        list={list}
        detail={detail}
        backLabel={backLabel}
        className={className}
      />
    );
  }

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

export function SplitView({ bleed = true, ...props }: SplitViewProps) {
  return (
    <div
      className={cn("flex min-h-0 flex-1 flex-col", bleed && SPLIT_BLEED_CLASS)}
    >
      <SplitViewPanes {...props} />
    </div>
  );
}

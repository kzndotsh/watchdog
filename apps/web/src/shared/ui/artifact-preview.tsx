import { ChevronDownIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { CodeBlock } from "@/shared/ui/code-block";
import {
  CHIP_SIZE_CLASS,
  DetailStatusChip,
} from "@/shared/ui/detail-status-chip";
import { JsonView } from "@/shared/ui/json-view";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/shared/ui/shadcn/collapsible";
import { Skeleton } from "@/shared/ui/shadcn/skeleton";

export type ArtifactPreviewBody =
  | { kind: "loading" }
  | { kind: "json"; data: unknown; defaultExpanded?: number }
  | { kind: "text"; code: string; mime: string }
  | { kind: "binary" }
  | { kind: "custom"; children: ReactNode };

function ArtifactPreviewBodyView({
  body,
}: {
  body: ArtifactPreviewBody;
}): ReactNode {
  switch (body.kind) {
    case "loading": {
      return (
        <div className="space-y-2 py-1" aria-busy aria-live="polite">
          <Skeleton className="h-3 w-full rounded-sm" />
          <Skeleton className="h-3 w-5/6 rounded-sm" />
          <Skeleton className="h-3 w-2/3 rounded-sm" />
        </div>
      );
    }
    case "json": {
      return (
        <JsonView
          data={body.data}
          defaultExpanded={body.defaultExpanded ?? 1}
          className="!bg-transparent !p-0"
        />
      );
    }
    case "text": {
      return <CodeBlock code={body.code} mime={body.mime} />;
    }
    case "binary": {
      return (
        <p className="text-muted-foreground py-2 text-xs">
          Binary artifact — not renderable.
        </p>
      );
    }
    case "custom": {
      return body.children;
    }
    default: {
      const _exhaustive: never = body;
      return _exhaustive;
    }
  }
}

/**
 * Presentational artifact viewer chrome. No fetch.
 * Header toggles body (same collapse pattern as Intake Jobs run cards).
 */
export function ArtifactPreview({
  name,
  mime,
  meta,
  headerAction,
  body,
  className,
  defaultOpen = true,
  open: openProp,
  onOpenChange: onOpenChangeProp,
}: {
  name: string;
  /** Omit when the name already carries type (e.g. Intake Content). */
  mime?: string;
  meta?: ReactNode;
  headerAction?: ReactNode;
  body: ArtifactPreviewBody;
  className?: string;
  /** When false, start collapsed (filename header still visible). */
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const open = openProp ?? internalOpen;
  const onOpenChange = onOpenChangeProp ?? setInternalOpen;

  return (
    <Collapsible
      open={open}
      onOpenChange={onOpenChange}
      data-slot="artifact-preview"
      className={cn(
        "border-border flex flex-col overflow-hidden rounded-md border",
        className
      )}
    >
      <CollapsibleTrigger
        nativeButton={false}
        render={<div />}
        className="group/artifact-trigger hover:bg-muted/40 focus-visible:ring-ring/50 flex w-full items-center gap-2 border-b px-3 py-2 text-left outline-none focus-visible:ring-2"
      >
        <ChevronDownIcon
          className="text-muted-foreground size-3.5 shrink-0 transition-transform group-aria-expanded/artifact-trigger:rotate-180"
          aria-hidden
        />
        <span className="text-foreground min-w-0 flex-1 truncate font-mono text-xs font-medium">
          {name}
        </span>
        {mime !== undefined && mime !== "" ? (
          <DetailStatusChip size="sm" className="shrink-0">
            {mime}
          </DetailStatusChip>
        ) : null}
        {headerAction === undefined ? null : (
          <>
            {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- keep header control from toggling the preview */}
            <span
              className="shrink-0"
              onMouseDown={(event) => {
                event.stopPropagation();
              }}
            >
              {headerAction}
            </span>
          </>
        )}
      </CollapsibleTrigger>

      <CollapsibleContent>
        {meta ? (
          <div className="border-border space-y-1.5 border-b px-3 py-2">
            {meta}
          </div>
        ) : null}

        <div className="bg-muted/40 rounded-b-md p-3">
          <ArtifactPreviewBodyView body={body} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Artifact preview skeleton — same chrome as {@link ArtifactPreview} (open by default). */
export function ArtifactPreviewSkeleton({
  className,
  defaultOpen = true,
  showMeta = false,
}: {
  className?: string;
  defaultOpen?: boolean;
  showMeta?: boolean;
}) {
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      data-slot="artifact-preview-skeleton"
      className={cn(
        "border-border flex flex-col overflow-hidden rounded-md border",
        className
      )}
    >
      <div className="border-border group/artifact-trigger flex w-full items-center gap-2 border-b px-3 py-2">
        <ChevronDownIcon
          className="text-muted-foreground size-3.5 shrink-0"
          aria-hidden
        />
        <Skeleton className="h-3 max-w-full min-w-0 flex-1 basis-36 rounded-sm" />
        <Skeleton className={cn(CHIP_SIZE_CLASS.md, "w-[4.5rem] shrink-0")} />
      </div>

      <CollapsibleContent>
        {showMeta ? (
          <div className="border-border space-y-1.5 border-b px-3 py-2">
            <Skeleton className="h-3 w-20" />
          </div>
        ) : null}

        <div className="bg-muted/40 rounded-b-md p-3">
          <div className="space-y-2">
            <Skeleton className="h-40 w-full rounded-md" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

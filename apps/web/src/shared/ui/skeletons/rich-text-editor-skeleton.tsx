import { cn } from "@/lib/utils";
import { LoadingRegion } from "@/shared/ui/loading-region";
import {
  RICH_TEXT_TOOLBAR_MIN_HEIGHT_CLASS,
  shellMinHeight,
} from "@/shared/ui/rich-text/rich-text-shell";
import { RICH_TEXT_SKELETON_TOOLBAR_BUTTON_COUNT } from "@/shared/ui/skeletons/constants";
import { Skeleton } from "@watchdog/ui/components/skeleton";

type RichTextEditorSkeletonProps = {
  variant?: "default" | "seamless";
  toolbar?: "always" | "focus";
  shouldFill?: boolean;
  className?: string;
};

/** Fallback for the lazy rich-text editor: same shell, toolbar row and body as the real one. */
export function RichTextEditorSkeleton({
  variant = "default",
  toolbar = "always",
  shouldFill = false,
  className,
}: RichTextEditorSkeletonProps) {
  const isSeamless = variant === "seamless";
  return (
    <LoadingRegion
      label="Loading editor"
      className={cn(
        "bg-background flex flex-col overflow-hidden rounded-md border",
        isSeamless ? "border-border" : "border-input",
        shellMinHeight(shouldFill, isSeamless),
        className
      )}
    >
      {toolbar === "always" ? (
        <div
          className={cn(
            "border-border bg-muted/30 flex items-center gap-1 border-b px-1 py-1",
            RICH_TEXT_TOOLBAR_MIN_HEIGHT_CLASS
          )}
        >
          {Array.from({ length: RICH_TEXT_SKELETON_TOOLBAR_BUTTON_COUNT }).map(
            (_, index) => (
              <Skeleton key={index} className="size-7 shrink-0 rounded-md" />
            )
          )}
        </div>
      ) : null}
      <div className="flex flex-1 flex-col gap-2 px-3 py-2">
        <Skeleton className="h-4 w-[90%]" />
        <Skeleton className="h-4 w-[70%]" />
      </div>
    </LoadingRegion>
  );
}

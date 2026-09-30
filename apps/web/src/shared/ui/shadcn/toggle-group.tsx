import { createContext, useContext, type ComponentProps } from "react";

import { cn } from "@/lib/utils";
import {
  ToggleGroup as BaseToggleGroup,
  ToggleGroupItem as BaseToggleGroupItem,
} from "@watchdog/ui/components/toggle-group";

export * from "@watchdog/ui/components/toggle-group";

type BaseVariant = ComponentProps<typeof BaseToggleGroup>["variant"];

const SegmentedContext = createContext(false);

/** Upstream ToggleGroup + `variant="segmented"` (a view-mode switch on a muted track). */
export function ToggleGroup({
  variant,
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof BaseToggleGroup>, "variant"> & {
  variant?: BaseVariant | "segmented";
}) {
  const segmented = variant === "segmented";
  return (
    <SegmentedContext.Provider value={segmented}>
      <BaseToggleGroup
        variant={segmented ? "default" : variant}
        className={cn(segmented && "bg-muted h-7 rounded-md p-0.5", className)}
        {...props}
      >
        {children}
      </BaseToggleGroup>
    </SegmentedContext.Provider>
  );
}

export function ToggleGroupItem({
  className,
  ...props
}: ComponentProps<typeof BaseToggleGroupItem>) {
  const segmented = useContext(SegmentedContext);
  return (
    <BaseToggleGroupItem
      className={cn(
        segmented &&
          "text-muted-foreground aria-pressed:bg-background aria-pressed:text-foreground h-6 min-w-0 px-2.5 text-xs aria-pressed:shadow-sm",
        className
      )}
      {...props}
    />
  );
}

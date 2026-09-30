import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";
import { SidebarMenuButton as BaseSidebarMenuButton } from "@watchdog/ui/components/sidebar";

export * from "@watchdog/ui/components/sidebar";

type BaseVariant = ComponentProps<typeof BaseSidebarMenuButton>["variant"];

/** Upstream SidebarMenuButton + `variant="muted"` (secondary entries such as Search…). */
export function SidebarMenuButton({
  variant,
  className,
  ...props
}: Omit<ComponentProps<typeof BaseSidebarMenuButton>, "variant"> & {
  variant?: BaseVariant | "muted";
}) {
  const muted = variant === "muted";
  return (
    <BaseSidebarMenuButton
      variant={muted ? "default" : variant}
      className={cn(muted && "text-muted-foreground hover:text-foreground", className)}
      {...props}
    />
  );
}

import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";
import { Input as BaseInput } from "@watchdog/ui/components/input";

export * from "@watchdog/ui/components/input";

const VARIANTS = {
  default: "",
  // Reads as inline metadata until focused.
  ghost:
    "border-transparent bg-transparent px-1 shadow-none focus-visible:border-input focus-visible:bg-background focus-visible:ring-1 dark:bg-transparent dark:focus-visible:bg-background",
  "ghost-muted":
    "text-muted-foreground border-transparent bg-transparent px-1 shadow-none focus-visible:border-input focus-visible:bg-background focus-visible:ring-1 dark:bg-transparent dark:focus-visible:bg-background",
  // No chrome at all (quick-create rows).
  bare: "border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent",
} as const;

const SIZES = {
  default: "",
  // Inline titles.
  lg: "h-9 text-base md:text-base",
} as const;

/** Upstream Input + `variant`, `size` (native `size` is not exposed) and `mono`. */
export function Input({
  variant = "default",
  size = "default",
  mono = false,
  className,
  ...props
}: Omit<ComponentProps<typeof BaseInput>, "size"> & {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  mono?: boolean;
}) {
  return (
    <BaseInput
      className={cn(
        VARIANTS[variant],
        SIZES[size],
        mono && "font-mono",
        className
      )}
      {...props}
    />
  );
}

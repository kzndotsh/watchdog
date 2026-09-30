// @ts-nocheck — shadcn vendor; excluded from project checks
import { Input as InputPrimitive } from "@base-ui/react/input";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const inputVariants = cva(
  "border-input file:text-foreground placeholder:text-muted-foreground disabled:bg-input/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 h-8 w-full min-w-0 rounded-md border bg-transparent px-2.5 py-1 text-sm transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3",
  {
    variants: {
      // Watchdog: ghost reads as inline metadata until focused; bare has no chrome at all.
      variant: {
        default: "",
        ghost:
          "border-transparent bg-transparent px-1 shadow-none focus-visible:border-input focus-visible:bg-background focus-visible:ring-1 dark:bg-transparent dark:focus-visible:bg-background",
        "ghost-muted":
          "text-muted-foreground border-transparent bg-transparent px-1 shadow-none focus-visible:border-input focus-visible:bg-background focus-visible:ring-1 dark:bg-transparent dark:focus-visible:bg-background",
        bare: "border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent",
      },
      // sm = 12px dense forms; lg = 16px inline titles.
      size: {
        default: "",
        sm: "h-7 text-xs",
        lg: "h-9 text-base",
      },
      mono: { true: "font-mono", false: "" },
    },
    defaultVariants: { variant: "default", size: "default", mono: false },
  }
);

function Input({
  className,
  type,
  variant,
  size,
  mono,
  ...props
}: Omit<React.ComponentProps<"input">, "size"> &
  VariantProps<typeof inputVariants>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(inputVariants({ variant, size, mono }), className)}
      {...props}
    />
  );
}

export { Input };

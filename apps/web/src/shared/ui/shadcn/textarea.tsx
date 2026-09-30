// @ts-nocheck — shadcn vendor; excluded from project checks
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const textareaVariants = cva(
  "border-input placeholder:text-muted-foreground disabled:bg-input/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 flex field-sizing-content min-h-16 w-full rounded-md border bg-transparent px-2.5 py-2 text-sm transition-colors outline-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3",
  {
    variants: {
      // Watchdog: sm = 12px dense composers.
      size: { default: "", sm: "text-xs" },
      mono: { true: "font-mono", false: "" },
    },
    defaultVariants: { size: "default", mono: false },
  }
);

function Textarea({
  className,
  size,
  mono,
  ...props
}: Omit<React.ComponentProps<"textarea">, "size"> &
  VariantProps<typeof textareaVariants>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(textareaVariants({ size, mono }), className)}
      {...props}
    />
  );
}

export { Textarea };

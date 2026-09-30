import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";
import {
  Button as BaseButton,
  buttonVariants,
} from "@watchdog/ui/components/button";
import { Spinner } from "@watchdog/ui/components/spinner";

export * from "@watchdog/ui/components/button";
export { buttonVariants };

type BaseProps = ComponentProps<typeof BaseButton>;
type BaseVariant = NonNullable<BaseProps["variant"]>;
type BaseSize = NonNullable<BaseProps["size"]>;

/** Watchdog variants: an upstream variant plus the delta. Upstream stays untouched. */
const EXTRA_VARIANTS = {
  "ghost-muted": { base: "ghost", className: "text-muted-foreground" },
  "ghost-destructive": {
    base: "ghost",
    className:
      "text-destructive hover:bg-destructive/10 hover:text-destructive aria-expanded:bg-destructive/10 dark:hover:bg-destructive/20",
  },
  "outline-destructive": {
    base: "outline",
    className:
      "text-destructive hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20",
  },
  dashed: {
    base: "ghost",
    className:
      "text-muted-foreground border-border/60 hover:bg-muted/40 hover:text-foreground border-dashed font-normal",
  },
} as const satisfies Record<string, { base: BaseVariant; className: string }>;

/** Pill-shaped dense control (add / count chips). */
const EXTRA_SIZES = {
  chip: {
    base: "xs",
    className: "h-5 gap-0.5 rounded-full px-1.5 text-xs",
  },
} as const satisfies Record<string, { base: BaseSize; className: string }>;

type ExtraVariant = keyof typeof EXTRA_VARIANTS;
type ExtraSize = keyof typeof EXTRA_SIZES;

function isExtraVariant(value: unknown): value is ExtraVariant {
  return typeof value === "string" && value in EXTRA_VARIANTS;
}

function isExtraSize(value: unknown): value is ExtraSize {
  return typeof value === "string" && value in EXTRA_SIZES;
}

export type ButtonProps = Omit<BaseProps, "variant" | "size"> & {
  variant?: BaseVariant | ExtraVariant;
  size?: BaseSize | ExtraSize;
  /** Shows a Spinner and disables the control. */
  loading?: boolean;
};

/**
 * Watchdog Button: upstream shadcn Button + `loading`, extra variants / sizes, and
 * `data-variant` / `data-size` / `data-loading` hooks (dialog Enter-to-confirm and
 * coarse-pointer sizing key on them).
 */
export function Button({
  variant,
  size,
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  const extraVariant = isExtraVariant(variant) ? EXTRA_VARIANTS[variant] : null;
  const extraSize = isExtraSize(size) ? EXTRA_SIZES[size] : null;
  const baseVariant = isExtraVariant(variant) ? extraVariant?.base : variant;
  const baseSize = isExtraSize(size) ? extraSize?.base : size;

  return (
    <BaseButton
      variant={baseVariant}
      size={baseSize}
      data-variant={variant ?? "default"}
      data-size={size ?? "default"}
      data-loading={loading || undefined}
      disabled={(disabled ?? false) || loading}
      className={cn(extraVariant?.className, extraSize?.className, className)}
      {...props}
    >
      {loading ? <Spinner data-icon="inline-start" /> : null}
      {children}
    </BaseButton>
  );
}

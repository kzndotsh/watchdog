import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";
import { Button as BaseButton } from "@watchdog/ui/components/button";
import { Spinner } from "@watchdog/ui/components/spinner";

export * from "@watchdog/ui/components/button";

type BaseSize = NonNullable<ComponentProps<typeof BaseButton>["size"]>;

/**
 * The size scale. Height belongs here, never in a call site's `className` (lint
 * `watchdog/no-button-height-class`): `xs` h-5, `sm` h-6, `default` h-7, `lg` h-8, the
 * square `icon-xs` / `icon-sm` / `icon` / `icon-lg`, and `inline` for a text link that
 * sits in running text (no control height, no padding).
 */
export type ButtonSize = BaseSize | "inline";

type BaseVariant = NonNullable<ComponentProps<typeof BaseButton>["variant"]>;

/**
 * The variant scale: upstream's plus `link-muted`, the `link` variant in
 * `text-muted-foreground` for a quiet secondary link (a section header's "Open").
 */
export type ButtonVariant = BaseVariant | "link-muted";

export type ButtonProps = Omit<
  ComponentProps<typeof BaseButton>,
  "size" | "variant"
> & {
  size?: ButtonSize;
  variant?: ButtonVariant;
  /** Shows a Spinner and disables the control. */
  loading?: boolean;
};

/** `inline` rides on the default size, then drops what makes a button a control. */
const INLINE_CLASS = "h-auto min-h-0 p-0";

const LINK_MUTED_CLASS = "text-muted-foreground";

/**
 * Upstream shadcn Button + `loading` + the `inline` size, plus the `data-variant` /
 * `data-size` / `data-loading` hooks that dialog Enter-to-confirm and coarse-pointer
 * sizing key on.
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
  const inline = size === "inline";
  const isMuted = variant === "link-muted";
  return (
    <BaseButton
      variant={isMuted ? "link" : variant}
      size={inline ? "default" : size}
      data-variant={variant ?? "default"}
      data-size={size ?? "default"}
      data-loading={loading || undefined}
      disabled={(disabled ?? false) || loading}
      className={cn(
        inline && INLINE_CLASS,
        isMuted && LINK_MUTED_CLASS,
        className
      )}
      {...props}
    >
      {loading ? <Spinner data-icon="inline-start" /> : null}
      {children}
    </BaseButton>
  );
}

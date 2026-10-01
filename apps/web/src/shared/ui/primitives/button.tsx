import type { ComponentProps } from "react";

import { Button as BaseButton } from "@watchdog/ui/components/button";
import { Spinner } from "@watchdog/ui/components/spinner";

export * from "@watchdog/ui/components/button";

export type ButtonProps = ComponentProps<typeof BaseButton> & {
  /** Shows a Spinner and disables the control. */
  loading?: boolean;
};

/**
 * Upstream shadcn Button + `loading`, plus the `data-variant` / `data-size` /
 * `data-loading` hooks that dialog Enter-to-confirm and coarse-pointer sizing key on.
 */
export function Button({
  variant,
  size,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <BaseButton
      variant={variant}
      size={size}
      data-variant={variant ?? "default"}
      data-size={size ?? "default"}
      data-loading={loading || undefined}
      disabled={(disabled ?? false) || loading}
      {...props}
    >
      {loading ? <Spinner data-icon="inline-start" /> : null}
      {children}
    </BaseButton>
  );
}

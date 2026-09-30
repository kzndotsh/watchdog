import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardFooter } from "@/shared/ui/shadcn/card";

type FormSectionTone = "default" | "error" | "warning";

/** Fieldset / list card surface — steel-cyan wash (Settings, Cases, …). */
export const ACCENT_CARD_SURFACE =
  "bg-accent/8 ring-accent/25 dark:bg-accent/12 dark:ring-accent/30";

/**
 * Settings fieldset-card chrome: title, optional subtitle, body, footer.
 * Presentational only — no I/O. Do not confuse with FieldSet (a11y grouping).
 */
export function FormSection({
  title,
  description,
  children,
  footer,
  footerStatus,
  tone = "default",
  className,
  contentClassName,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  footerStatus?: ReactNode;
  tone?: FormSectionTone;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <section
      data-slot="form-section"
      data-tone={tone}
      className={cn("space-y-3", className)}
    >
      <div className="space-y-1">
        <h2 className="text-foreground text-sm font-semibold">{title}</h2>
        {description ? (
          <p className="text-muted-foreground text-xs">{description}</p>
        ) : null}
      </div>

      <Card
        className={cn(
          ACCENT_CARD_SURFACE,
          tone === "error" &&
            "bg-destructive/5 ring-destructive/40 dark:bg-destructive/10",
          tone === "warning" && "bg-signal/8 ring-signal/35"
        )}
      >
        <CardContent className={cn("flex flex-col gap-6", contentClassName)}>
          {children}
        </CardContent>

        {footer || footerStatus ? (
          <CardFooter className="border-accent/20 dark:border-accent/25 justify-between gap-3">
            <div className="text-muted-foreground min-w-0 text-xs">
              {footerStatus}
            </div>
            {footer ? (
              <div className="ml-auto flex shrink-0 items-center gap-2">
                {footer}
              </div>
            ) : null}
          </CardFooter>
        ) : null}
      </Card>
    </section>
  );
}

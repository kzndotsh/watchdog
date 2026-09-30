/* oxlint-disable react/only-export-components -- nav const + guide chrome components */
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { SectionLabel } from "@/shared/ui/section-label";

export const GUIDE_NAV = [
  { id: "foundations", label: "Foundations" },
  { id: "atoms", label: "Atoms" },
] as const;

/** Sticky section nav — sits under PageHeader (h-10 → top-10). */
export function GuideToc({ className }: { className?: string }) {
  return (
    <nav
      aria-label="Style guide sections"
      className={cn(
        // ds:allow-decorative — sticky section nav over scrolling specimens; blur keeps labels legible
        "border-border bg-background/95 sticky top-10 z-10 -mx-3 flex h-9 shrink-0 items-center gap-x-4 overflow-x-auto border-b px-3 backdrop-blur-sm sm:-mx-4 sm:px-4",
        className
      )}
    >
      {GUIDE_NAV.map(({ id, label }) => (
        <a
          key={id}
          href={`#${id}`}
          className="text-muted-foreground hover:text-foreground shrink-0 text-sm underline-offset-4 hover:underline"
          onClick={(e) => {
            // Scroll inside Page (overflow-y-auto), not the window.
            const el = document.querySelector(`#${id}`);
            if (!el) return;
            e.preventDefault();
            el.scrollIntoView({ behavior: "smooth", block: "start" });
            history.replaceState(null, "", `#${id}`);
          }}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}

export function GuideSection({
  id,
  title,
  blurb,
  children,
}: {
  id: string;
  title: string;
  blurb: string;
  children: ReactNode;
}) {
  // Clears sticky PageHeader (h-10) + GuideToc (h-9).
  return (
    <section id={id} className="scroll-mt-[4.75rem] space-y-4">
      <div className="space-y-0.5">
        <SectionLabel as="h2">{title}</SectionLabel>
        <p className="text-muted-foreground max-w-2xl text-sm">{blurb}</p>
      </div>
      {children}
    </section>
  );
}

export function Specimen({
  label,
  blurb,
  children,
  className,
}: {
  label: string;
  blurb?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-border bg-card/30 flex flex-col gap-2 rounded-md border p-3",
        className
      )}
    >
      <div className="space-y-0.5">
        <span className="text-label-mono-sm text-muted-foreground">
          {label}
        </span>
        {blurb ? (
          <p className="text-muted-foreground text-xs leading-snug">{blurb}</p>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {children}
      </div>
    </div>
  );
}

export function Swatch({
  name,
  className,
}: {
  name: string;
  className: string;
}) {
  return (
    <div className="flex min-w-24 flex-col gap-1.5">
      <div className={cn("border-border h-8 rounded-md border", className)} />
      <span className="text-label-mono-sm text-muted-foreground truncate">
        {name}
      </span>
    </div>
  );
}

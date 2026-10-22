import type { ReactNode } from "react";

export type LibraryEntrySectionProps = {
  title: string;
  children: ReactNode;
};

/** A quiet heading over its content. */
export function LibraryEntrySection({
  title,
  children,
}: LibraryEntrySectionProps) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-muted-foreground text-xs tracking-widest uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

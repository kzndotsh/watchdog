import type { ReactNode } from "react";

export type LibraryEntryRowProps = {
  label: string;
  children: ReactNode;
};

/** A definition row: label over value on mobile, beside it from `sm`. */
export function LibraryEntryRow({ label, children }: LibraryEntryRowProps) {
  return (
    <div className="flex flex-col gap-1 text-sm sm:flex-row sm:gap-6">
      <dt className="text-muted-foreground sm:w-28 sm:shrink-0">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

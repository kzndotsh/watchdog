import type { ReactNode } from "react";

export type LibraryEntryMetaProps = {
  label: string;
  children: ReactNode;
};

/** A small muted label with its value under it, in the aside. */
export function LibraryEntryMeta({ label, children }: LibraryEntryMetaProps) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="text-muted-foreground text-xs">{label}</span>
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}

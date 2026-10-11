import type { ReactNode } from "react";

/** Grid cell pair used inside MetaGrid. */
export function MetaGridItem({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <span className="text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </>
  );
}

import type { ReactNode } from "react";

/** Accessible busy wrapper — shared by PendingRegion, graph shells, and hand skeletons. */
export function LoadingRegion({
  label,
  className,
  children,
  busy = true,
}: {
  label: string;
  className?: string;
  children: ReactNode;
  busy?: boolean;
}): ReactNode {
  if (!busy) {
    return className ? <div className={className}>{children}</div> : children;
  }

  return (
    <div className={className} aria-busy>
      <span className="sr-only" role="status">
        {label}
      </span>
      <div aria-hidden className="contents">
        {children}
      </div>
    </div>
  );
}

import type { ReactNode } from "react";

import { IdChip } from "@/shared/ui/id-chip";
import { QueueRowMeta } from "@/shared/ui/queue-row-meta";
import { RelativeTime } from "@/shared/ui/relative-time";

type QueueRowInstantMetaProps = {
  value: string;
  id: string;
  children?: ReactNode;
  className?: string;
};

/** clock · relative · IdChip (+ optional trailing meta). */
export function QueueRowInstantMeta({
  value,
  id,
  children,
  className,
}: QueueRowInstantMetaProps) {
  return (
    <QueueRowMeta className={className}>
      <RelativeTime value={value} />
      <span aria-hidden>·</span>
      <IdChip value={id} copyable className="opacity-80" />
      {children}
    </QueueRowMeta>
  );
}

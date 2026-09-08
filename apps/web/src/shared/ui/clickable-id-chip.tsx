import { IdChip } from "@/shared/ui/id-chip";

/**
 * Evidence id chip with preview affordance (eye glyph).
 * Thin wrapper over `IdChip` `onPreview`.
 */
export function ClickableIdChip({
  value,
  display,
  onClick,
  head = 8,
  tail = 0,
  className,
}: {
  value: string;
  display?: string;
  onClick?: (value: string) => void;
  head?: number;
  tail?: number;
  className?: string;
}) {
  return (
    <IdChip
      value={value}
      display={display}
      head={head}
      tail={tail}
      className={className}
      onPreview={onClick}
    />
  );
}

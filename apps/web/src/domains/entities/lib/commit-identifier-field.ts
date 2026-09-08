import { toast } from "@/shared/ui/shadcn/toast";
import {
  HANDLE_REQUIRES_PLATFORM,
  normalizeIdentifierPlatform,
  validateIdentifierWrite,
  type IdentifierType,
} from "@watchdog/schemas";

export { HANDLE_REQUIRES_PLATFORM };

export function isHandleWithoutPlatform(
  type: IdentifierType,
  platform: string
): boolean {
  return type === "handle" && normalizeIdentifierPlatform(platform) === "";
}

/** Inline value commit — toast + reject, or normalized value. */
export function tryCommitIdentifierValue(
  type: IdentifierType,
  next: string,
  platform: string
): string | false {
  const written = validateIdentifierWrite({ type, value: next, platform });
  if (!written.ok) {
    toast.error(written.message);
    return false;
  }
  return written.value;
}

/** Type-change commit — toast + reject, or type + re-normalized value. */
export function tryCommitIdentifierType(
  type: IdentifierType,
  value: string,
  platform: string
): { type: IdentifierType; value: string } | false {
  const written = validateIdentifierWrite({ type, value, platform });
  if (!written.ok) {
    toast.error(written.message);
    return false;
  }
  return { type: written.type, value: written.value };
}

/** Platform commit when type is handle — toast + reject, or normalized platform. */
export function tryCommitIdentifierPlatform(
  type: IdentifierType,
  value: string,
  platform: string
): string | false {
  const written = validateIdentifierWrite({ type, value, platform });
  if (!written.ok) {
    toast.error(written.message);
    return false;
  }
  return written.platform;
}

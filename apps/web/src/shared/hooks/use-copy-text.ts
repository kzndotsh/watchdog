import { useCallback, useEffect, useRef, useState } from "react";

import { toast } from "@/shared/ui/toast";

/** How long a copy control shows its copied state. */
export const COPIED_RESET_MS = 1500;

export type CopyTextOptions = {
  /** Toast text on success; none when omitted (a control showing its own copied state). */
  readonly success?: string;
  /** Toast text on failure, or from the error; the failure is silent when omitted. */
  readonly failure?: string | ((error: unknown) => string);
};

/** Write `text` to the clipboard, with the success and failure toasts the caller names. Resolves whether it was written. */
export async function copyText(
  text: string,
  { success, failure }: CopyTextOptions = {}
): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    if (failure !== undefined) {
      toast.error(typeof failure === "function" ? failure(error) : failure);
    }
    return false;
  }
  if (success !== undefined) toast.success(success);
  return true;
}

type UseCopyTextOptions = CopyTextOptions & {
  /** The copied state's duration; `COPIED_RESET_MS` when omitted. */
  readonly resetMs?: number;
  /** Called after a write that lands while the control is still mounted. */
  readonly onCopied?: (text: string) => void;
};

/**
 * Copy text and expose an `isCopied` state that resets after `resetMs`. A write that settles after
 * unmount sets nothing and leaves no timer behind.
 */
export function useCopyText({
  resetMs = COPIED_RESET_MS,
  onCopied,
  success,
  failure,
}: UseCopyTextOptions = {}): {
  copy: (text: string) => Promise<boolean>;
  isCopied: boolean;
} {
  const [isCopied, setIsCopied] = useState(false);
  const timerRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const copy = useCallback(
    async (text: string) => {
      const isWritten = await copyText(text, { success, failure });
      if (!isWritten || !isMountedRef.current) return isWritten;
      setIsCopied(true);
      onCopied?.(text);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setIsCopied(false);
      }, resetMs);
      return true;
    },
    [resetMs, onCopied, success, failure]
  );

  return { copy, isCopied };
}

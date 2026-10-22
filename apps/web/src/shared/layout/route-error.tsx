import { useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import {
  CheckIcon,
  CopyIcon,
  RefreshCwIcon,
  RotateCcwIcon,
} from "lucide-react";
import { useState } from "react";

import { errMessage } from "@/lib/utils";
import { useRouteErrorRecovery } from "@/shared/hooks/use-route-error-recovery";
import { RouteNotFoundCenter } from "@/shared/layout/route-not-found-center";
import { Button } from "@/shared/ui/primitives/button";

/**
 * Shared route errorComponent for data-bearing pages: a centred card with the message in a
 * selectable block, Copy error, Retry (reload the route's data) and Reload page (for a stale
 * module after a deploy or a dev reload, which Retry cannot fix).
 */
export function RouteError({ error }: ErrorComponentProps) {
  const router = useRouter();
  useRouteErrorRecovery(error);
  const message = errMessage(error, "Failed to load page");
  const [isCopied, setIsCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(message);
    setIsCopied(true);
  };

  return (
    <RouteNotFoundCenter eyebrow="Error" title="This page couldn't load">
      <pre className="bg-muted text-foreground max-h-48 overflow-auto rounded-md p-3 font-mono text-xs break-words whitespace-pre-wrap select-text">
        {message}
      </pre>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => {
            void router.invalidate();
          }}
        >
          <RotateCcwIcon data-icon="inline-start" />
          Retry
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            window.location.reload();
          }}
        >
          <RefreshCwIcon data-icon="inline-start" />
          Reload page
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            void handleCopy();
          }}
        >
          {isCopied ? (
            <CheckIcon data-icon="inline-start" />
          ) : (
            <CopyIcon data-icon="inline-start" />
          )}
          {isCopied ? "Copied" : "Copy error"}
        </Button>
      </div>
    </RouteNotFoundCenter>
  );
}

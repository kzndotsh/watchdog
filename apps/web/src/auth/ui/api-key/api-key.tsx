"use client";

import type { ListedApiKey } from "@better-auth-ui/core/plugins/api-key";
import { useAuth, useAuthPlugin } from "@better-auth-ui/react";
import { Key, X } from "lucide-react";
import { useState } from "react";

import { apiKeyPlugin } from "@/auth/plugins/api-key";
import { firstNonEmpty } from "@/lib/utils";
import { Button } from "@/shared/ui/primitives/button";
import { Card, CardContent } from "@watchdog/ui/components/card";

import { DeleteApiKeyDialog } from "./delete-api-key-dialog";

export interface ApiKeyProps {
  apiKey: ListedApiKey;
  /** Hide the row's delete button (e.g., when caller lacks `apiKey:delete`). */
  hideDelete?: boolean;
  /** Scope the delete payload to an organization (sets `configId`). */
  organizationId?: string;
}

export function ApiKey({ apiKey, hideDelete, organizationId }: ApiKeyProps) {
  const { localization } = useAuth();
  const { localization: apiKeyLocalization } = useAuthPlugin(apiKeyPlugin);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const preview = `${apiKey.start}${"*".repeat(16)}`;

  return (
    <Card className="border-0 bg-transparent shadow-none ring-0">
      <CardContent className="flex items-center gap-3">
        <div className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-md">
          <Key className="size-4.5" />
        </div>

        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm leading-tight font-medium">
            {firstNonEmpty(apiKey.name) ?? apiKeyLocalization.apiKey}
          </span>

          <span className="text-muted-foreground truncate font-mono text-xs">
            {preview}
          </span>

          <span className="text-muted-foreground text-xs">
            {new Date(apiKey.createdAt).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </span>
        </div>

        {!hideDelete && (
          <>
            <Button
              className="ml-auto shrink-0"
              variant="outline"
              size="sm"
              onClick={() => {
                setDeleteOpen(true);
              }}
              aria-label={apiKeyLocalization.deleteApiKey}
            >
              <X />

              {localization.settings.delete}
            </Button>

            <DeleteApiKeyDialog
              open={deleteOpen}
              onOpenChange={setDeleteOpen}
              apiKey={apiKey}
              organizationId={organizationId}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

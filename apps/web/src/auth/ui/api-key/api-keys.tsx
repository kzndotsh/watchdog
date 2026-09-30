import { useAuthPlugin } from "@better-auth-ui/react";
import { useListApiKeys } from "@better-auth-ui/react/plugins/api-key";
import { useState } from "react";

import { authClient } from "@/auth/client";
import { apiKeyPlugin } from "@/auth/plugins/api-key";
import { cn } from "@/lib/utils";
import { ACCENT_CARD_SURFACE } from "@/shared/ui/form-section";
import { Button } from "@/shared/ui/primitives/button";
import { Card, CardContent } from "@watchdog/ui/components/card";
import { Separator } from "@watchdog/ui/components/separator";

import { ApiKey } from "./api-key";
import { ApiKeySkeleton } from "./api-key-skeleton";
import { ApiKeysEmpty } from "./api-keys-empty";
import { CreateApiKeyDialog } from "./create-api-key-dialog";

export interface ApiKeysProps {
  className?: string;
  /** Scope the list and create payload to an organization. */
  organizationId?: string;
  /** Force the loading skeleton and disable the list query. */
  isPending?: boolean;
  /** Hide the "Create API key" button (header + empty state). */
  hideCreate?: boolean;
  /** Hide the per-row delete button on listed keys. */
  hideDelete?: boolean;
}

export function ApiKeys({
  className,
  organizationId,
  isPending: isPendingProp,
  hideCreate,
  hideDelete,
}: ApiKeysProps) {
  const { localization: apiKeyLocalization } = useAuthPlugin(apiKeyPlugin);

  const { data: listData, isPending: isListPending } = useListApiKeys(
    authClient,
    {
      enabled: !isPendingProp,
      ...(organizationId
        ? { query: { organizationId, configId: "organization" } }
        : {}),
    }
  );

  const isPending = Boolean(isPendingProp) || isListPending;

  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-end justify-between gap-3">
        <h2 className="truncate text-sm font-semibold">
          {apiKeyLocalization.apiKeys}
        </h2>

        {!hideCreate && (
          <Button
            className="shrink-0"
            size="sm"
            disabled={isPending}
            onClick={() => {
              setCreateOpen(true);
            }}
          >
            {apiKeyLocalization.createApiKey}
          </Button>
        )}
      </div>

      <Card className={cn(ACCENT_CARD_SURFACE, "gap-0 p-0 py-0")}>
        <CardContent className="p-0">
          {isPending ? (
            <ApiKeySkeleton />
          ) : !listData?.apiKeys.length ? (
            <ApiKeysEmpty
              onCreatePress={() => {
                setCreateOpen(true);
              }}
              hideCreate={hideCreate}
            />
          ) : (
            listData.apiKeys.map((key, index) => (
              <div key={key.id}>
                {index > 0 && <Separator />}

                <ApiKey
                  apiKey={key}
                  hideDelete={hideDelete}
                  organizationId={organizationId}
                />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {!hideCreate && (
        <CreateApiKeyDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          organizationId={organizationId}
        />
      )}
    </div>
  );
}

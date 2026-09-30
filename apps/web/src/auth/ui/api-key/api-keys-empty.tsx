import { useAuthPlugin } from "@better-auth-ui/react";
import { Key } from "lucide-react";

import { apiKeyPlugin } from "@/auth/plugins/api-key";
import { Button } from "@/shared/ui/primitives/button";
import { Card, CardContent } from "@watchdog/ui/components/card";

export interface ApiKeysEmptyProps {
  onCreatePress: () => void;
  hideCreate?: boolean;
}

export function ApiKeysEmpty({ onCreatePress, hideCreate }: ApiKeysEmptyProps) {
  const { localization: apiKeyLocalization } = useAuthPlugin(apiKeyPlugin);

  return (
    <Card className="border-0 bg-transparent shadow-none ring-0">
      <CardContent className="flex flex-col items-center justify-center gap-4">
        <div className="bg-muted flex size-10 items-center justify-center rounded-md">
          <Key className="size-4.5" />
        </div>

        <div className="flex flex-col items-center justify-center gap-1 text-center">
          <p className="text-sm font-semibold">
            {apiKeyLocalization.noApiKeys}
          </p>

          <p className="text-muted-foreground text-xs">
            {apiKeyLocalization.apiKeysDescription}
          </p>
        </div>

        {!hideCreate && (
          <Button size="sm" onClick={onCreatePress}>
            {apiKeyLocalization.createApiKey}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

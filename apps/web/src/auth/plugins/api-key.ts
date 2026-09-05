import { createAuthPlugin } from "@better-auth-ui/core";
import {
  type ApiKeyPluginOptions,
  apiKeyPlugin as coreApiKeyPlugin,
} from "@better-auth-ui/core/plugins";

export const apiKeyPlugin = createAuthPlugin(
  coreApiKeyPlugin.id,
  (options: ApiKeyPluginOptions = {}) => {
    const core = coreApiKeyPlugin(options);

    return {
      ...core,
      // We render <ApiKeys /> in a dedicated tab — don't inject into Security.
      securityCards: [],
      // Org-owned keys stay off until actor.userId can stay a user id.
      organizationCards: [],
    };
  }
);

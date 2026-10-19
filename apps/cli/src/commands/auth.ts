import { defineCommand } from "citty";

import { SCOPES } from "@watchdog/schemas/shared";

import { api, emit } from "../client";
import { withExamples } from "../examples";

export const authCmd = defineCommand({
  meta: {
    name: "auth",
    description: "Show who the CLI acts as",
  },
  subCommands: {
    status: defineCommand({
      meta: {
        name: "status",
        description: withExamples(
          "Print the current credential's kind, key id, scopes and organization",
          ["wd auth status"]
        ),
      },
      run: async () => {
        const me = await api().auth.whoami();
        const missing = SCOPES.filter((scope) => !me.scopes.includes(scope));
        emit({
          credential: me.credential,
          keyId: me.keyId,
          scopes: me.scopes,
          organizationId: me.organizationId,
          ...(missing.length > 0
            ? {
                help: [
                  `Missing scopes: ${missing.join(", ")}. Create a key with them in Settings → API Keys.`,
                ],
              }
            : {}),
        });
      },
    }),
  },
});

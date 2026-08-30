import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { KeyIcon, ShieldIcon, UserIcon, WrenchIcon } from "lucide-react";
import { Suspense } from "react";
import { z } from "zod";

import { ApiKeys } from "@/auth/ui/api-key/api-keys";
import { Settings as AuthSettings } from "@/auth/ui/settings/settings";
import { SettingsCredentialsForm } from "@/domains/settings/components/settings-credentials-form";
import {
  SETTINGS_TABS,
  SettingsShell,
  type SettingsNavItem,
  type SettingsTab,
} from "@/domains/settings/components/settings-shell";
import { credentialsListQuery } from "@/domains/settings/queries";
import { Page, PageHeader } from "@/shared/layout/page";
import { RouteError } from "@/shared/layout/route-error";
import { warmPrefetchQuery } from "@/shared/lib/warm-query";
import { stackPendingFallback } from "@/shared/ui/active-tab-body";

const routeApi = getRouteApi("/_protected/settings/");

const SETTINGS_NAV: readonly SettingsNavItem[] = [
  {
    id: "account",
    label: "Account",
    description: "Name, avatar, and email.",
    icon: UserIcon,
  },
  {
    id: "security",
    label: "Security",
    description: "Password, sessions, and linked accounts.",
    icon: ShieldIcon,
  },
  {
    id: "api-keys",
    label: "API Keys",
    description: "Keys for API access.",
    icon: KeyIcon,
  },
  {
    id: "credentials",
    label: "Credentials",
    description: "Connect third-party API keys that Caps use at runtime.",
    icon: WrenchIcon,
  },
];

function parseSettingsTab(value: unknown): SettingsTab | undefined {
  if (typeof value !== "string") return undefined;
  for (const tab of SETTINGS_TABS) {
    if (tab === value) return tab;
  }
  return undefined;
}

const settingsSearchSchema = z.object({
  tab: z.unknown().transform(parseSettingsTab).optional(),
});

function SettingsPanel({ tab }: { tab: SettingsTab }) {
  switch (tab) {
    case "account":
    case "security": {
      return (
        <div className="max-w-2xl">
          <AuthSettings view={tab} hideNav />
        </div>
      );
    }
    case "api-keys": {
      return (
        <div className="max-w-2xl">
          <ApiKeys />
        </div>
      );
    }
    case "credentials": {
      return (
        <Suspense fallback={stackPendingFallback(1)}>
          <SettingsCredentialsForm />
        </Suspense>
      );
    }
    default: {
      const _exhaustive: never = tab;
      return _exhaustive;
    }
  }
}

function SettingsPage() {
  const { tab: tabSearch } = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const activeTab: SettingsTab = tabSearch ?? "account";

  function setTab(next: SettingsTab) {
    void navigate({
      search: (prev) => ({
        ...prev,
        tab: next === "account" ? undefined : next,
      }),
      replace: true,
    });
  }

  return (
    <Page>
      <PageHeader />
      <SettingsShell
        items={SETTINGS_NAV}
        activeTab={activeTab}
        onTabChange={setTab}
      >
        <SettingsPanel tab={activeTab} />
      </SettingsShell>
    </Page>
  );
}

export const Route = createFileRoute("/_protected/settings/")({
  validateSearch: settingsSearchSchema,
  loaderDeps: () => ({}),
  loader: async ({ context: { queryClient } }) => {
    // Warm credentials for the Credentials tab; shell does not need them to paint.
    warmPrefetchQuery(queryClient, credentialsListQuery());
  },
  errorComponent: RouteError,
  component: SettingsPage,
});

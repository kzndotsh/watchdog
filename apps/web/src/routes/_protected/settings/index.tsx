import { useSession } from "@better-auth-ui/react";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import {
  KeyIcon,
  ShieldIcon,
  UserCogIcon,
  UserIcon,
  UsersIcon,
  WrenchIcon,
} from "lucide-react";
import { Suspense, useCallback } from "react";
import { z } from "zod";

import { authClient } from "@/auth/client";
import { isInstanceAdmin } from "@/auth/instance-admin";
import { ApiKeys } from "@/auth/ui/api-key/api-keys";
import { Settings as AuthSettings } from "@/auth/ui/settings/settings";
import { TeamSettings } from "@/auth/ui/team/team-settings";
import { UsersSettings } from "@/auth/ui/users/users-settings";
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
import { Spinner } from "@/shared/ui/shadcn/spinner";

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
    id: "team",
    label: "Team",
    description: "Invite investigators and manage organization membership.",
    icon: UsersIcon,
  },
  {
    id: "users",
    label: "Users",
    description:
      "Disable or enable install accounts. Organization membership is on Team.",
    icon: UserCogIcon,
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

function SettingsPanel({
  tab,
  canManageUsers,
  sessionPending,
}: {
  tab: SettingsTab;
  canManageUsers: boolean;
  sessionPending: boolean;
}) {
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
    case "team": {
      return <TeamSettings />;
    }
    case "users": {
      if (sessionPending) {
        return (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        );
      }
      if (!canManageUsers) {
        return (
          <p className="text-muted-foreground text-sm">
            Only install admins can manage users.
          </p>
        );
      }
      return <UsersSettings />;
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
  const { data: session, isPending: sessionPending } = useSession(authClient);
  const canManageUsers = isInstanceAdmin(
    (session?.user as { role?: string | null } | undefined)?.role
  );
  const activeTab: SettingsTab = tabSearch ?? "account";
  const navItems = SETTINGS_NAV.filter(
    (item) => item.id !== "users" || canManageUsers
  );

  const setTab = useCallback(
    (next: SettingsTab) => {
      void navigate({
        search: (prev) => ({
          ...prev,
          tab: next === "account" ? undefined : next,
        }),
        replace: true,
      });
    },
    [navigate]
  );

  return (
    <Page>
      <PageHeader />
      <SettingsShell
        items={navItems}
        titles={SETTINGS_NAV}
        activeTab={activeTab}
        onTabChange={setTab}
      >
        <SettingsPanel
          tab={activeTab}
          canManageUsers={canManageUsers}
          sessionPending={sessionPending}
        />
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

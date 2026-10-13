import { useSession } from "@better-auth-ui/react";
import {
  createFileRoute,
  getRouteApi,
  useRouterState,
} from "@tanstack/react-router";
import {
  BuildingIcon,
  KeyIcon,
  PaletteIcon,
  SettingsIcon,
  ShieldIcon,
  UserCogIcon,
  UserIcon,
  UsersIcon,
  WrenchIcon,
} from "lucide-react";
import { useCallback, useEffect } from "react";
import { z } from "zod";

import { authClient } from "@/auth/client";
import { ApiKeys } from "@/auth/ui/api-key/api-keys";
import { Settings as AuthSettings } from "@/auth/ui/settings/settings";
import { OrganizationMembers } from "@/domains/organization/components/organization-members";
import { OrganizationProfile } from "@/domains/organization/components/organization-profile";
import { YourOrganizations } from "@/domains/organization/components/your-organizations";
import { SettingsAppearanceSection } from "@/domains/settings/components/settings-appearance-section";
import { SettingsCredentialsForm } from "@/domains/settings/components/settings-credentials-form";
import {
  SETTINGS_LEGACY_TABS,
  SETTINGS_TABS,
  SettingsShell,
  type SettingsNavItem,
  type SettingsTab,
} from "@/domains/settings/components/settings-shell";
import { SettingsUsers } from "@/domains/settings/components/settings-users";
import { credentialsListQuery } from "@/domains/settings/queries";
import { Page } from "@/shared/layout/page";
import { PageHeader } from "@/shared/layout/page-header";
import { RouteError } from "@/shared/layout/route-error";
import { tabSearchParam } from "@/shared/lib/tab-search";
import { warmEnsureQueryData } from "@/shared/lib/warm-query";
import { isInstanceAdmin } from "@watchdog/auth/instance-admin";
import { Spinner } from "@watchdog/ui/components/spinner";

const routeApi = getRouteApi("/_protected/settings/");

const SETTINGS_NAV: readonly SettingsNavItem[] = [
  {
    id: "account",
    group: "Personal",
    label: "Account",
    description: "Update your name, photo, and email.",
    icon: UserIcon,
  },
  {
    id: "security",
    group: "Personal",
    label: "Security",
    description: "Change your password and review where you're signed in.",
    icon: ShieldIcon,
  },
  {
    id: "appearance",
    group: "Personal",
    label: "Appearance",
    description: "Pick a theme and set how large the app looks.",
    icon: PaletteIcon,
  },
  {
    id: "api-keys",
    group: "Personal",
    label: "API Keys",
    description: "Create and revoke keys for the API.",
    icon: KeyIcon,
  },
  {
    id: "credentials",
    group: "Personal",
    label: "Credentials",
    description: "Connect the outside services Watchdog looks things up in.",
    icon: WrenchIcon,
  },
  {
    id: "organizations",
    group: "Personal",
    label: "Organizations",
    description: "Switch organizations, create one, or answer an invitation.",
    icon: BuildingIcon,
  },
  {
    id: "organization",
    group: "Organization",
    label: "General",
    description:
      "Rename the organization, change its logo, or leave or delete it.",
    icon: SettingsIcon,
  },
  {
    id: "members",
    group: "Organization",
    label: "Members",
    description: "Invite people, change roles, and manage pending invitations.",
    icon: UsersIcon,
  },
  {
    id: "users",
    group: "Administration",
    label: "Users",
    description:
      "Review every account on this server and disable any that shouldn't sign in.",
    icon: UserCogIcon,
  },
];

const settingsSearchSchema = z.object({
  tab: tabSearchParam(SETTINGS_TABS, SETTINGS_LEGACY_TABS),
});

type SettingsPanelProps = {
  tab: SettingsTab;
  canManageUsers: boolean;
  isSessionPending: boolean;
};

function SettingsPanel({
  tab,
  canManageUsers,
  isSessionPending,
}: SettingsPanelProps) {
  switch (tab) {
    case "account":
    case "security": {
      return (
        <div className="max-w-2xl">
          <AuthSettings view={tab} hideNav />
        </div>
      );
    }
    case "appearance": {
      return <SettingsAppearanceSection />;
    }
    case "api-keys": {
      return (
        <div className="max-w-2xl">
          <ApiKeys />
        </div>
      );
    }
    case "organizations": {
      return (
        <div className="max-w-2xl">
          <YourOrganizations />
        </div>
      );
    }
    case "organization": {
      return (
        <div className="max-w-2xl">
          <OrganizationProfile />
        </div>
      );
    }
    case "members": {
      return <OrganizationMembers />;
    }
    case "users": {
      if (isSessionPending) {
        return (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        );
      }
      if (!canManageUsers) {
        return (
          <p className="text-muted-foreground text-sm">
            Only server admins can manage accounts.
          </p>
        );
      }
      return <SettingsUsers />;
    }
    case "credentials": {
      return <SettingsCredentialsForm />;
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
  const searchStr = useRouterState({
    select: (s) => s.location.searchStr,
  });
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

  useEffect(() => {
    const raw = new URLSearchParams(searchStr).get("tab");
    if (raw !== null && raw !== "" && tabSearch === undefined) {
      void navigate({
        search: (prev) => ({ ...prev, tab: undefined }),
        replace: true,
      });
    }
  }, [navigate, searchStr, tabSearch]);

  return (
    <Page className="gap-0">
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
          isSessionPending={sessionPending}
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
    warmEnsureQueryData(queryClient, {
      ...credentialsListQuery(),
      shouldRevalidateIfStale: true,
    });
  },
  errorComponent: RouteError,
  component: SettingsPage,
});

import { createFileRoute, Link, redirect } from "@tanstack/react-router";

import { ensureAppSession } from "@/auth/ensure-session";
import { getAllowSignup } from "@/auth/get-allow-signup";
import { AuthProductMark } from "@/auth/ui/auth-product-mark";
import { CreateOrganizationForm } from "@/domains/organization/components/create-organization-form";
import { reloadIntoOrganization } from "@/domains/organization/lib/switch-organization";
import { organizationStateQuery } from "@/domains/organization/queries";
import { Button } from "@/shared/ui/primitives/button";
import { isInstanceAdmin } from "@watchdog/auth/instance-admin";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@watchdog/ui/components/card";

function readRole(user: object): string | null {
  return "role" in user && typeof user.role === "string" ? user.role : null;
}

function OnboardingPage() {
  const { canCreate } = Route.useRouteContext();

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center px-4 py-10">
      <AuthProductMark />
      <Card>
        <CardHeader>
          <CardTitle>
            {canCreate
              ? "Create your organization"
              : "Waiting for an invitation"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            {canCreate ? (
              <>
                <p className="text-muted-foreground text-sm">
                  An organization holds your Cases, members, and API keys. You
                  can create more later.
                </p>
                <CreateOrganizationForm onCreated={reloadIntoOrganization} />
              </>
            ) : (
              <>
                <p className="text-muted-foreground text-sm">
                  This install is invitation-only. Ask an owner or admin to
                  invite you to their organization, then open the link they
                  send.
                </p>
                <Button
                  variant="outline"
                  render={
                    <Link to="/auth/$path" params={{ path: "sign-out" }} />
                  }
                  nativeButton={false}
                >
                  Sign out
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

export const Route = createFileRoute("/onboarding")({
  beforeLoad: async ({ context: { queryClient }, location }) => {
    const session = await ensureAppSession(queryClient);
    if (!session) {
      // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router's redirect() throws a Response, per docs
      throw redirect({
        to: "/auth/$path",
        params: { path: "sign-in" },
        search: { redirectTo: location.href },
      });
    }

    const { organizationId } = await queryClient.query(
      organizationStateQuery()
    );
    if (organizationId) {
      // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router's redirect() throws a Response, per docs
      throw redirect({ to: "/" });
    }

    const allowSignup = await getAllowSignup();
    return {
      canCreate: allowSignup || isInstanceAdmin(readRole(session.user)),
    };
  },
  component: OnboardingPage,
});

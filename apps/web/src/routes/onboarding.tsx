import { createFileRoute, Link, redirect } from "@tanstack/react-router";

import { ensureOrganizationState } from "@/auth/ensure-organization";
import { ensureAppSession } from "@/auth/ensure-session";
import { getAllowSignup } from "@/auth/get-allow-signup";
import { FirstCaseStep } from "@/domains/cases/components/first-case-step";
import { casesContextQuery } from "@/domains/cases/queries";
import { CreateOrganizationForm } from "@/domains/organization/components/create-organization-form";
import { useReloadIntoOrganization } from "@/domains/organization/hooks/use-reload-into-organization";
import { AuthProductMark } from "@/shared/layout/auth-product-mark";
import { Button } from "@/shared/ui/primitives/button";
import { isInstanceAdminRole } from "@watchdog/schemas/shared";
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
  const reloadIntoOrganization = useReloadIntoOrganization();
  const { canCreate, step } = Route.useRouteContext();

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center px-4 py-10">
      <AuthProductMark />
      {step === "case" ? (
        <FirstCaseStep />
      ) : (
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
      )}
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

    const { organizationId } = await ensureOrganizationState(
      queryClient,
      session
    );
    if (organizationId) {
      // Second step: an organization with no live Case asks for its first one; anyone with
      // a Case belongs in the app. Read through the query's own freshness, not the guard's
      // static copy, so a Case created elsewhere is seen.
      const { cases } = await queryClient.query(casesContextQuery());
      // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router's redirect() throws a Response, per docs
      if (cases.length > 0) throw redirect({ to: "/" });
      return { canCreate: true, step: "case" as const };
    }

    const allowSignup = await getAllowSignup();
    return {
      canCreate: allowSignup || isInstanceAdminRole(readRole(session.user)),
      step: "organization" as const,
    };
  },
  component: OnboardingPage,
});

import { createFileRoute, getRouteApi } from "@tanstack/react-router";

import { AcceptInvitation } from "@/auth/ui/accept-invitation";
import { AuthProductMark } from "@/auth/ui/auth-product-mark";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { trimmedUuidSchema } from "@watchdog/schemas";

const routeApi = getRouteApi("/auth/accept-invitation/$invitationId");

function AcceptInvitationPage() {
  const { invitationId: rawInvitationId } = routeApi.useParams();
  const parsed = trimmedUuidSchema.safeParse(rawInvitationId);

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center px-4 py-10">
      <AuthProductMark />
      {parsed.success ? (
        <AcceptInvitation invitationId={parsed.data} />
      ) : (
        <FetchErrorAlert error="Invitation link is invalid" />
      )}
    </main>
  );
}

export const Route = createFileRoute("/auth/accept-invitation/$invitationId")({
  component: AcceptInvitationPage,
});

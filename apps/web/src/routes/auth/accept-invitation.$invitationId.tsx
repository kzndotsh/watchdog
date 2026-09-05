import { createFileRoute, getRouteApi } from "@tanstack/react-router";

import { AcceptInvitation } from "@/auth/ui/accept-invitation";
import { AuthProductMark } from "@/auth/ui/auth-product-mark";

const routeApi = getRouteApi("/auth/accept-invitation/$invitationId");

function AcceptInvitationPage() {
  const { invitationId } = routeApi.useParams();

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center px-4 py-10">
      <AuthProductMark />
      <AcceptInvitation invitationId={invitationId} />
    </main>
  );
}

export const Route = createFileRoute("/auth/accept-invitation/$invitationId")({
  component: AcceptInvitationPage,
});

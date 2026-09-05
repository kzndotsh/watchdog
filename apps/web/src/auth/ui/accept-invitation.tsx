"use client";

import { useSession } from "@better-auth-ui/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { authClient } from "@/auth/client";
import {
  fetchInvitationPreview,
  inviteSignUp,
} from "@/auth/invitation-api";
import { invitationAcceptPath } from "@/auth/invitation-url";
import { errMessage } from "@/lib/utils";
import { Alert, AlertDescription } from "@/shared/ui/shadcn/alert";
import { Button } from "@/shared/ui/shadcn/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/shadcn/card";
import { Field, FieldGroup } from "@/shared/ui/shadcn/field";
import { Input } from "@/shared/ui/shadcn/input";
import { Label } from "@/shared/ui/shadcn/label";
import { Spinner } from "@/shared/ui/shadcn/spinner";

export function AcceptInvitation({ invitationId }: { invitationId: string }) {
  const { data: session, isPending: sessionPending } = useSession(authClient);
  const previewQuery = useQuery({
    queryKey: ["invitation-preview", invitationId],
    queryFn: () => fetchInvitationPreview(invitationId),
  });

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const acceptExisting = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.organization.acceptInvitation({
        invitationId,
      });
      if (error) throw new Error(error.message || "Could not accept invitation");
    },
    onSuccess: () => {
      window.location.assign("/");
    },
  });

  const registerInvitee = useMutation({
    mutationFn: () =>
      inviteSignUp({
        invitationId,
        name,
        password,
      }),
    onSuccess: () => {
      window.location.assign("/");
    },
  });

  if (previewQuery.isPending || sessionPending) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }

  if (previewQuery.error || !previewQuery.data) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {errMessage(previewQuery.error, "Invitation not found or expired.")}
        </AlertDescription>
      </Alert>
    );
  }

  const preview = previewQuery.data;
  const sessionEmail = session?.user.email?.toLowerCase();
  const inviteEmail = preview.email.toLowerCase();
  const signedIn = Boolean(session?.user);
  const emailMatches = signedIn && sessionEmail === inviteEmail;
  const pending = acceptExisting.isPending || registerInvitee.isPending;
  const actionError =
    formError ||
    (acceptExisting.error
      ? errMessage(acceptExisting.error, "Could not accept invitation")
      : null) ||
    (registerInvitee.error
      ? errMessage(registerInvitee.error, "Could not create account")
      : null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Join {preview.organizationName}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          Invitation for <span className="text-foreground">{preview.email}</span>{" "}
          as {preview.role}.
        </p>

        {actionError ? (
          <Alert variant="destructive">
            <AlertDescription>{actionError}</AlertDescription>
          </Alert>
        ) : null}

        {signedIn && !emailMatches ? (
          <p className="text-sm">
            You are signed in as {session?.user.email}. Sign out, then open this
            link again with {preview.email}.
          </p>
        ) : null}

        {emailMatches ? (
          <Button
            type="button"
            disabled={pending}
            onClick={() => {
              setFormError(null);
              acceptExisting.mutate();
            }}
          >
            {pending ? <Spinner /> : null}
            Accept invitation
          </Button>
        ) : null}

        {!signedIn ? (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              setFormError(null);
              if (!name.trim() || !password) {
                setFormError("Name and password are required.");
                return;
              }
              registerInvitee.mutate();
            }}
          >
            <FieldGroup>
              <Field>
                <Label htmlFor="invite-email">Email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={preview.email}
                  readOnly
                  autoComplete="username"
                />
              </Field>
              <Field>
                <Label htmlFor="invite-name">Name</Label>
                <Input
                  id="invite-name"
                  name="name"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                  }}
                  autoComplete="name"
                  required
                />
              </Field>
              <Field>
                <Label htmlFor="invite-password">Password</Label>
                <Input
                  id="invite-password"
                  name="password"
                  type="password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                  }}
                  autoComplete="new-password"
                  required
                />
              </Field>
            </FieldGroup>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner /> : null}
              Create account and join
            </Button>
            <p className="text-muted-foreground text-sm">
              Already have an account?{" "}
              <a
                className="text-foreground underline"
                href={`/auth/sign-in?redirectTo=${encodeURIComponent(invitationAcceptPath(invitationId))}`}
              >
                Sign in
              </a>
            </p>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}

import { authQueryKeys } from "@better-auth-ui/core";
import { useSession } from "@better-auth-ui/react";
import { useListOrganizations } from "@better-auth-ui/react/plugins/organization";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type SubmitEvent } from "react";

import { authClient } from "@/auth/client";
import { reloadIntoOrganization } from "@/domains/organization/lib/switch-organization";
import { errMessage } from "@/lib/utils";
import { FormSection } from "@/shared/ui/form-section";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/shared/ui/primitives/alert-dialog";
import { Button } from "@/shared/ui/primitives/button";
import { canManageTeam } from "@watchdog/auth/org-roles";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@watchdog/ui/components/field";
import { Input } from "@watchdog/ui/components/input";
import { Spinner } from "@watchdog/ui/components/spinner";

/** The active organization: rename it (owner / admin) or leave it (anyone but the last owner). */
export function OrganizationProfile() {
  const queryClient = useQueryClient();
  const { data: sessionData } = useSession(authClient);
  const { data: organizations, isPending } = useListOrganizations(authClient);
  const activeId = sessionData?.session.activeOrganizationId ?? null;
  const organization =
    organizations?.find((org) => org.id === activeId) ?? organizations?.[0];
  const { data: roleData } = useQuery({
    queryKey: ["organization", "member-role", organization?.id],
    enabled: organization !== undefined,
    queryFn: async () => {
      const { data, error } =
        await authClient.organization.getActiveMemberRole();
      if (error) throw new Error(error.message ?? "Could not load your role");
      return data;
    },
  });
  const update = useMutation({
    mutationFn: async (input: { id: string; name: string; slug: string }) => {
      const { error } = await authClient.organization.update({
        organizationId: input.id,
        data: { name: input.name, slug: input.slug },
      });
      if (error) throw new Error(error.message ?? "Could not save");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: authQueryKeys.all });
    },
  });
  const remove = useMutation({
    mutationFn: async (organizationId: string) => {
      const { error } = await authClient.organization.delete({
        organizationId,
      });
      if (error) throw new Error(error.message ?? "Could not delete");
    },
  });
  const leave = useMutation({
    mutationFn: async (organizationId: string) => {
      const { error } = await authClient.organization.leave({ organizationId });
      if (error) throw new Error(error.message ?? "Could not leave");
    },
  });
  const [draft, setDraft] = useState<{ name: string; slug: string } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [confirmName, setConfirmName] = useState("");

  if (isPending || !organization) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  const canEdit = canManageTeam(roleData?.role ?? "");
  const isOwner = (roleData?.role ?? "")
    .split(",")
    .some((part) => part.trim() === "owner");
  const name = draft?.name ?? organization.name;
  const slug = draft?.slug ?? organization.slug;
  const dirty =
    draft !== null &&
    (draft.name.trim() !== organization.name ||
      draft.slug.trim() !== organization.slug);

  function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organization || !draft) return;
    setError(null);
    update.mutate(
      {
        id: organization.id,
        name: draft.name.trim(),
        slug: draft.slug.trim(),
      },
      {
        onSuccess: () => {
          setDraft(null);
        },
        onError: (mutationError) => {
          setError(errMessage(mutationError, "Could not save"));
        },
      }
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={save}>
        <FormSection
          title="Organization"
          description="Cases, members, and API keys belong to one organization."
          footer={
            canEdit ? (
              <Button
                type="submit"
                disabled={!dirty}
                loading={update.isPending}
              >
                Save
              </Button>
            ) : undefined
          }
          footerStatus={
            canEdit ? undefined : "Only owners and admins can edit this."
          }
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="org-name">Name</FieldLabel>
              <Input
                id="org-name"
                value={name}
                disabled={!canEdit || update.isPending}
                onChange={(event) => {
                  setDraft({ name: event.target.value, slug });
                }}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="org-slug">URL name</FieldLabel>
              <Input
                id="org-slug"
                className="font-mono"
                value={slug}
                disabled={!canEdit || update.isPending}
                onChange={(event) => {
                  setDraft({ name, slug: event.target.value });
                }}
              />
            </Field>
          </FieldGroup>
          <FieldError>{error}</FieldError>
        </FormSection>
      </form>

      <FormSection
        tone="warning"
        title="Leave organization"
        description="You lose access to its Cases. The last owner can't leave: promote someone else first."
        footer={
          <AlertDialog>
            <AlertDialogTrigger
              render={<Button variant="outline" type="button" />}
            >
              Leave
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Leave {organization.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  You can only rejoin if someone invites you again.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <Button
                  variant="destructive"
                  loading={leave.isPending}
                  onClick={() => {
                    leave.mutate(organization.id, {
                      onSuccess: reloadIntoOrganization,
                      onError: (mutationError) => {
                        setError(errMessage(mutationError, "Could not leave"));
                      },
                    });
                  }}
                >
                  Leave
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        }
      >
        <p className="text-muted-foreground text-sm">
          Your role: {roleData?.role ?? "member"}
        </p>
      </FormSection>

      {isOwner ? (
        <FormSection
          tone="error"
          title="Delete organization"
          description="Permanently deletes the organization with all of its Cases, evidence, artifacts, members, and invitations. This can't be undone."
          footer={
            <AlertDialog
              onOpenChange={() => {
                setConfirmName("");
              }}
            >
              <AlertDialogTrigger
                render={<Button variant="destructive" type="button" />}
              >
                Delete
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Delete {organization.name}?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Every Case and all evidence in this organization is deleted
                    for everyone. Type the organization name to confirm.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <Input
                  aria-label="Organization name"
                  value={confirmName}
                  placeholder={organization.name}
                  onChange={(event) => {
                    setConfirmName(event.target.value);
                  }}
                />
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <Button
                    variant="destructive"
                    disabled={confirmName !== organization.name}
                    loading={remove.isPending}
                    onClick={() => {
                      remove.mutate(organization.id, {
                        onSuccess: reloadIntoOrganization,
                        onError: (mutationError) => {
                          setError(
                            errMessage(mutationError, "Could not delete")
                          );
                        },
                      });
                    }}
                  >
                    Delete everything
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          }
        >
          <FieldError>{error}</FieldError>
        </FormSection>
      ) : null}
    </div>
  );
}

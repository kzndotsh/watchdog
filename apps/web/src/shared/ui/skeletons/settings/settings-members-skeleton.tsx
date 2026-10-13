import { FormSection } from "@/shared/ui/form-section";
import { SETTINGS_MEMBERS_SKELETON_ROWS } from "@/shared/ui/skeletons/constants";
import { Field } from "@watchdog/ui/components/field";
import { Label } from "@watchdog/ui/components/label";
import { Skeleton } from "@watchdog/ui/components/skeleton";

/** One member row: name line + `email · role` line, and the row actions button. */
function MemberRowSkeleton() {
  return (
    <li
      data-slot="settings-members-skeleton-row"
      className="flex items-center justify-between gap-3 py-2"
    >
      <div className="min-w-0">
        {/* Each bone sits in a box as tall as the real text line (text-sm / text-xs). */}
        <div className="flex h-5 items-center">
          <Skeleton className="h-3.5 w-36" />
        </div>
        <div className="flex h-4 items-center">
          <Skeleton className="h-3 w-52" />
        </div>
      </div>
      <Skeleton className="size-6 shrink-0 rounded-md" />
    </li>
  );
}

/**
 * Settings > Members loading state: the same three cards as the page (Invite someone,
 * members list, Pending invitations). Titles and labels are static chrome and stay real
 * text; only the inputs, rows and buttons are bones.
 */
export function SettingsMembersSkeleton() {
  return (
    <div className="max-w-2xl space-y-6">
      <FormSection
        title="Invite someone"
        description="Send an invitation by email. If mail isn't set up, copy the link from Pending invitations."
        footer={<Skeleton className="h-6 w-14 rounded-md" />}
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
          <Field>
            <Label>Email</Label>
            <Skeleton className="h-7 w-full rounded-md" />
          </Field>
          <Field>
            <Label>Role</Label>
            <Skeleton className="h-7 w-full rounded-md" />
          </Field>
        </div>
      </FormSection>

      <FormSection>
        <div className="grid gap-2 sm:grid-cols-[1fr_9rem]">
          <Skeleton className="h-7 w-full rounded-md" />
          <Skeleton className="h-7 w-full rounded-md" />
        </div>
        <ul className="divide-y">
          {Array.from(
            { length: SETTINGS_MEMBERS_SKELETON_ROWS },
            (_, index) => (
              // oxlint-disable-next-line react/no-array-index-key -- fixed-length bones, never reordered
              <MemberRowSkeleton key={index} />
            )
          )}
        </ul>
      </FormSection>

      <FormSection title="Pending invitations">
        <div className="flex h-5 items-center">
          <Skeleton className="h-3.5 w-44" />
        </div>
      </FormSection>
    </div>
  );
}

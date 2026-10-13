import { cn } from "@/lib/utils";
import { ACCENT_CARD_SURFACE } from "@/shared/ui/form-section";
import {
  SETTINGS_CREDENTIALS_SKELETON_CONNECTED_ROWS,
  SETTINGS_CREDENTIALS_SKELETON_DISCONNECTED_ROWS,
} from "@/shared/ui/skeletons/constants";
import { Separator } from "@watchdog/ui/components/separator";
import { Skeleton } from "@watchdog/ui/components/skeleton";

type RowProps = {
  /** Connected rows show an `Updated …` line and a second (Remove) button. */
  isConnected: boolean;
};

/** One credential slot row: status dot, label (+ updated line), action buttons. */
function CredentialRowSkeleton({ isConnected }: RowProps) {
  return (
    <div
      data-slot="settings-credentials-skeleton-row"
      className="flex items-center gap-3 px-4 py-3"
    >
      <Skeleton className="mt-0.5 size-3 shrink-0 rounded-full" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Skeleton className="h-3.5 w-32" />
        {isConnected ? <Skeleton className="h-3 w-40" /> : null}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <Skeleton className="h-6 w-14 rounded-md" />
        {isConnected ? <Skeleton className="h-6 w-14 rounded-md" /> : null}
      </div>
    </div>
  );
}

type GroupProps = {
  rows: number;
  isConnected: boolean;
  titleWidthClass: string;
};

/** Group heading bone plus a card of rows, mirroring `CredentialSlotGroup`. */
function CredentialGroupSkeleton({
  rows,
  isConnected,
  titleWidthClass,
}: GroupProps) {
  return (
    <div
      data-slot="settings-credentials-skeleton-group"
      className="flex flex-col gap-2"
    >
      <Skeleton className={cn("h-3", titleWidthClass)} />
      <div
        className={cn("overflow-hidden rounded-lg ring-1", ACCENT_CARD_SURFACE)}
      >
        {Array.from({ length: rows }, (_, index) => (
          // oxlint-disable-next-line react/no-array-index-key -- fixed-length bones, never reordered
          <div key={index}>
            {index > 0 ? <Separator /> : null}
            <CredentialRowSkeleton isConnected={isConnected} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Settings > Credentials loading state: the Connected and Not connected groups, same column width. */
export function SettingsCredentialsSkeleton() {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <CredentialGroupSkeleton
        rows={SETTINGS_CREDENTIALS_SKELETON_CONNECTED_ROWS}
        isConnected
        titleWidthClass="w-20"
      />
      <CredentialGroupSkeleton
        rows={SETTINGS_CREDENTIALS_SKELETON_DISCONNECTED_ROWS}
        isConnected={false}
        titleWidthClass="w-28"
      />
    </div>
  );
}

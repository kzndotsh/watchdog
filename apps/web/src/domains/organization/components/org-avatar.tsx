import { orgInitials } from "@/domains/organization/lib/org-logo";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@watchdog/ui/components/avatar";

/** Organization logo, or its initials when none is set. */
export function OrgAvatar({
  name,
  logo,
  className,
}: {
  name: string;
  logo?: string | null;
  className?: string;
}) {
  return (
    <Avatar size="sm" className={className}>
      {logo ? <AvatarImage src={logo} alt="" /> : null}
      <AvatarFallback>{orgInitials(name)}</AvatarFallback>
    </Avatar>
  );
}

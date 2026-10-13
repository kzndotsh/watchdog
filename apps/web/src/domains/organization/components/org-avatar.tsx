import { orgInitials } from "@/domains/organization/lib/org-logo";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@watchdog/ui/components/avatar";

type OrgAvatarProps = {
  name: string;
  logo?: string | null;
  className?: string;
};

/** Organization logo, or its initials when none is set. */
export function OrgAvatar({ name, logo, className }: OrgAvatarProps) {
  return (
    <Avatar size="sm" className={className}>
      {logo ? <AvatarImage src={logo} alt="" /> : null}
      <AvatarFallback>{orgInitials(name)}</AvatarFallback>
    </Avatar>
  );
}

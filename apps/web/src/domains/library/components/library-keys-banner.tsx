import { Link } from "@tanstack/react-router";
import { KeyRoundIcon } from "lucide-react";

import { LibraryBanner } from "@/domains/library/components/library-banner";
import { Button } from "@/shared/ui/primitives/button";

/** Shown only when some entries wait on a key. The count is a readiness fact, not usage. */
export function LibraryKeysBanner({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <LibraryBanner label="Connect keys">
      <p className="flex items-center gap-2 text-sm">
        <KeyRoundIcon aria-hidden className="size-4 shrink-0" />
        Connect keys to unlock {count}{" "}
        {count === 1 ? "Cap or Playbook" : "Caps and Playbooks"}
      </p>
      <Button
        variant="outline"
        size="sm"
        nativeButton={false}
        render={<Link to="/settings" search={{ tab: "credentials" }} />}
      >
        Connect keys
      </Button>
    </LibraryBanner>
  );
}

import {
  AtSignIcon,
  BoxIcon,
  FileIcon,
  GlobeIcon,
  HashIcon,
  KeyRoundIcon,
  Link2Icon,
  NetworkIcon,
  PhoneIcon,
  UserRoundIcon,
} from "lucide-react";

import { inputKindLabel } from "@/domains/library/lib/input-kinds";

const ICON_CLASS = "size-4";

/** The icon for an input kind (`lib/input-kinds.ts` vocabulary); a plain box for any other. */
function KindIcon({ kind }: { kind: string }) {
  switch (kind) {
    case "email": {
      return <AtSignIcon aria-hidden className={ICON_CLASS} />;
    }
    case "username": {
      return <UserRoundIcon aria-hidden className={ICON_CLASS} />;
    }
    case "phone": {
      return <PhoneIcon aria-hidden className={ICON_CLASS} />;
    }
    case "domain": {
      return <GlobeIcon aria-hidden className={ICON_CLASS} />;
    }
    case "ip": {
      return <NetworkIcon aria-hidden className={ICON_CLASS} />;
    }
    case "url": {
      return <Link2Icon aria-hidden className={ICON_CLASS} />;
    }
    case "hash": {
      return <HashIcon aria-hidden className={ICON_CLASS} />;
    }
    case "file": {
      return <FileIcon aria-hidden className={ICON_CLASS} />;
    }
    case "pgp": {
      return <KeyRoundIcon aria-hidden className={ICON_CLASS} />;
    }
    default: {
      return <BoxIcon aria-hidden className={ICON_CLASS} />;
    }
  }
}

/**
 * A card's tile: the icon of the first input kind the entry takes, with "+N" when it takes
 * more, so a grid filtered to one kind reads at a glance. Labelled "Takes …" for screen readers.
 */
export function LibraryKindTile({ kinds }: { kinds: readonly string[] }) {
  const [first, ...rest] = kinds;
  const label =
    kinds.length === 0
      ? "Takes no input"
      : `Takes ${kinds.map(inputKindLabel).join(", ")}`;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="bg-muted text-muted-foreground relative flex size-9 shrink-0 items-center justify-center rounded-md"
    >
      <KindIcon kind={first ?? ""} />
      {rest.length === 0 ? null : (
        <span className="bg-background text-muted-foreground border-border text-2xs absolute -right-1.5 -bottom-1.5 rounded-full border px-1 leading-4 tabular-nums">
          +{rest.length}
        </span>
      )}
    </span>
  );
}

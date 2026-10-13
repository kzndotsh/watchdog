import { cn } from "@/lib/utils";
import { useModKeyLabel } from "@/shared/hooks/use-mod-key-label";
import { Kbd, KbdGroup } from "@watchdog/ui/components/kbd";

/** Dense keys inside menus / command items. */
export const MENU_KBD_CLASS = "h-4 min-w-4 px-1 text-xs leading-tight";

type ActionShortcutChordProps = {
  chord: string;
  className?: string;
  kbdClassName?: string;
};

/** Catalog chord (`Mod+K`, `?`) as `Kbd` / `KbdGroup`. */
export function ActionShortcutChord({
  chord,
  className,
  kbdClassName,
}: ActionShortcutChordProps) {
  const modKeyLabel = useModKeyLabel();
  if (chord.startsWith("Mod+")) {
    const rest = chord.slice("Mod+".length);
    return (
      <KbdGroup className={className}>
        <Kbd className={kbdClassName}>{modKeyLabel}</Kbd>
        <Kbd className={kbdClassName}>{rest}</Kbd>
      </KbdGroup>
    );
  }
  return <Kbd className={cn(kbdClassName, className)}>{chord}</Kbd>;
}

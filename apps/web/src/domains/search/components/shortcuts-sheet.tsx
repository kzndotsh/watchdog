import { HOTKEYS } from "@/shared/lib/hotkeys";
import { ActionShortcutChord } from "@/shared/ui/action-list";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/shadcn/dialog";

interface ShortcutsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShortcutsSheet({ open, onOpenChange }: ShortcutsSheetProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Shortcuts</DialogTitle>
          <DialogDescription>
            Mod+K then type to search the Active Case or jump to a page.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-3">
          {HOTKEYS.map((entry) => (
            <li
              key={entry.id}
              className="flex items-start justify-between gap-4 text-sm"
            >
              <div className="min-w-0">
                <div className="font-medium">{entry.label}</div>
                <div className="text-muted-foreground">{entry.description}</div>
              </div>
              <ActionShortcutChord chord={entry.chord} />
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

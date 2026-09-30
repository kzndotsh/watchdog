import { PlusIcon } from "lucide-react";

import { Button } from "@/shared/ui/shadcn/button";

interface Props {
  /** Panel empty-state CTA uses a solid button + noun label; header uses ghost "Add". */
  variant: "ghost" | "panel";
  noun?: string;
  onClick: () => void;
}

export function DossierSectionAddButton({ variant, noun, onClick }: Props) {
  if (variant === "panel") {
    return (
      <Button type="button" size="sm" onClick={onClick}>
        <PlusIcon className="size-3.5" />
        {noun ? `Add ${noun}` : "Add"}
      </Button>
    );
  }

  return (
    <Button type="button" size="sm" variant="ghost" onClick={onClick}>
      <PlusIcon className="size-3" />
      Add
    </Button>
  );
}

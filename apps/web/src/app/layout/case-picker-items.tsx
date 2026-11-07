import { CheckIcon, PlusIcon } from "lucide-react";

import type { CaseRecord } from "@/domains/cases/types";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@watchdog/ui/components/dropdown-menu";

type CasePickerItemsProps = {
  cases: CaseRecord[];
  activeId: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
};

/** Case list for the switcher menu, ending with "Create case". */
export function CasePickerItems({
  cases,
  activeId,
  onSelect,
  onCreate,
}: CasePickerItemsProps) {
  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuLabel>Cases</DropdownMenuLabel>
        {cases.map((c) => {
          const isSelected = c.id === activeId;
          return (
            <DropdownMenuItem
              key={c.id}
              onClick={() => {
                onSelect(c.id);
              }}
            >
              <span className="truncate">{c.name}</span>
              {isSelected ? <CheckIcon className="ml-auto" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={onCreate}>
        <PlusIcon />
        Create case
      </DropdownMenuItem>
    </>
  );
}

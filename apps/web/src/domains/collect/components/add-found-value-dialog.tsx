import { useState } from "react";

import { useAddFoundValue } from "@/domains/collect/hooks/use-add-found-value";
import type { PickerPort } from "@/shared/hooks/use-picker-source";
import type { EntityOption } from "@/shared/ui/entity-combobox";
import { Button } from "@/shared/ui/primitives/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/primitives/dialog";
import { SearchedEntityCombobox } from "@/shared/ui/searched-entity-combobox";
import type { FoundValueRecord } from "@watchdog/schemas/jobs";
import { IDENTIFIER_TYPE_LABELS } from "@watchdog/schemas/shared";
import { Field, FieldError, FieldLabel } from "@watchdog/ui/components/field";

type AddFoundValueDialogProps = {
  caseId: string;
  /** The Case's Entity picker (`entityPickerPort(caseId)`). */
  entityPort: PickerPort<EntityOption>;
  jobId: string;
  /** The value to add; the dialog is open while it is set. */
  value: FoundValueRecord | null;
  /** The Evidence the Job landed: the new Identifier cites it. */
  evidenceIds: readonly string[];
  onClose: () => void;
};

/**
 * Pick the Entity a found value belongs to and add it there as an Identifier at Unverified,
 * citing the Job's Evidence. Entities that already hold the value are not offered.
 */
export function AddFoundValueDialog({
  caseId,
  entityPort,
  jobId,
  value,
  evidenceIds,
  onClose,
}: AddFoundValueDialogProps) {
  const [entity, setEntity] = useState<EntityOption | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { add, isPending } = useAddFoundValue({
    caseId,
    jobId,
    evidenceIds,
    onError: setError,
  });

  function handleClose() {
    setEntity(null);
    setError(null);
    onClose();
  }

  async function handleAdd() {
    if (value === null || entity === null) return;
    setError(null);
    const isAdded = await add(value, {
      id: entity.id,
      slug: entity.slug ?? "",
    });
    if (isAdded) handleClose();
  }

  return (
    <Dialog
      open={value !== null}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to Entity</DialogTitle>
          <DialogDescription>
            {value === null
              ? null
              : `${IDENTIFIER_TYPE_LABELS[value.type]} ${value.value} `}
            becomes an Identifier at Unverified, citing this Job&apos;s
            Evidence.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel>Entity</FieldLabel>
          <SearchedEntityCombobox
            port={entityPort}
            excludeIds={value?.onEntities.map((held) => held.id)}
            value={entity?.id ?? ""}
            onValueChange={(id) => {
              if (id === "") setEntity(null);
            }}
            onEntityChange={setEntity}
            placeholder="Search Entities…"
          />
          {error === null ? null : <FieldError>{error}</FieldError>}
        </Field>
        <DialogFooter>
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            disabled={entity === null || isPending}
            onClick={() => {
              void handleAdd();
            }}
          >
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

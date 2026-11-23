import { useState } from "react";

import { Field, FieldError, FieldLabel } from "#ui/components/field";
import { Input } from "#ui/components/input";
import { ToggleGroup, ToggleGroupItem } from "#ui/components/toggle-group";
import { useAddFoundValue } from "@/domains/collect/hooks/use-add-found-value";
import { entityPickerPort } from "@/domains/entities/queries";
import type { EntityOption } from "@/shared/ui/entity-combobox";
import { FieldSelect } from "@/shared/ui/field-select";
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
import { ENTITY_KIND_OPTIONS } from "@/shared/ui/vocab";
import type { FoundValueRecord } from "@watchdog/domain/schemas/jobs";
import {
  IDENTIFIER_TYPE_LABELS,
  trimmedEntityKindSchema,
  type EntityKind,
  type IdentifierType,
} from "@watchdog/domain/schemas/shared";

type AddFoundValueDialogProps = {
  caseId: string;
  jobId: string;
  /** The value to add; the dialog is open while it is set. */
  value: FoundValueRecord | null;
  /** The Evidence the Job landed: the new Identifier cites it. */
  evidenceIds: readonly string[];
  onClose: () => void;
};

const TARGETS = [
  { value: "existing", label: "Existing Entity" },
  { value: "new", label: "New Entity" },
] as const;

type Target = (typeof TARGETS)[number]["value"];

function isTarget(value: string | undefined): value is Target {
  return TARGETS.some((target) => target.value === value);
}

/** The kind a new Entity starts at for a value of this type: whoever holds such a value. */
const NEW_ENTITY_KIND: Record<IdentifierType, EntityKind> = {
  email: "person",
  handle: "person",
  phone: "person",
  pgp: "person",
  url: "infra",
  domain: "infra",
  ip: "infra",
  crypto: "infra",
  credential: "infra",
  other: "infra",
};

/** Mounts for one value (`key`), so the new Entity's name and kind start from it. */
function AddFoundValueForm({
  caseId,
  jobId,
  value,
  evidenceIds,
  onClose,
}: Omit<AddFoundValueDialogProps, "value"> & { value: FoundValueRecord }) {
  const [target, setTarget] = useState<Target>("existing");
  const [entity, setEntity] = useState<EntityOption | null>(null);
  const [name, setName] = useState(value.value);
  const [kind, setKind] = useState<EntityKind>(NEW_ENTITY_KIND[value.type]);
  const [error, setError] = useState<string | null>(null);
  const { add, addAsNewEntity, isPending } = useAddFoundValue({
    caseId,
    jobId,
    evidenceIds,
    onError: setError,
  });

  const isReady = target === "existing" ? entity !== null : name.trim() !== "";

  async function handleAdd() {
    setError(null);
    let isAdded = false;
    if (target === "new") {
      isAdded = await addAsNewEntity(value, { name: name.trim(), kind });
    } else if (entity !== null) {
      isAdded = await add(value, { id: entity.id, slug: entity.slug ?? "" });
    }
    if (isAdded) onClose();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add to Entity</DialogTitle>
        <DialogDescription>
          {`${IDENTIFIER_TYPE_LABELS[value.type]} ${value.value} `}
          becomes an Identifier at Unverified, citing this Job&apos;s Evidence.
        </DialogDescription>
      </DialogHeader>
      <ToggleGroup
        aria-label="Add to"
        spacing={1}
        value={[target]}
        onValueChange={(next: string[]) => {
          const picked = next[0];
          if (isTarget(picked)) {
            setTarget(picked);
            setError(null);
          }
        }}
        variant="outline"
      >
        {TARGETS.map((option) => (
          <ToggleGroupItem key={option.value} value={option.value}>
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {target === "existing" ? (
        <Field>
          <FieldLabel>Entity</FieldLabel>
          <SearchedEntityCombobox
            port={entityPickerPort(caseId)}
            excludeIds={value.onEntities.map((held) => held.id)}
            value={entity?.id ?? ""}
            onValueChange={(id) => {
              if (id === "") setEntity(null);
            }}
            onEntityChange={setEntity}
            placeholder="Search Entities…"
          />
          {error === null ? null : <FieldError>{error}</FieldError>}
        </Field>
      ) : (
        <>
          <Field>
            <FieldLabel>Name</FieldLabel>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
              }}
              disabled={isPending}
              aria-label="Entity name"
            />
          </Field>
          <Field>
            <FieldLabel>Kind</FieldLabel>
            <FieldSelect
              value={kind}
              options={ENTITY_KIND_OPTIONS}
              onValueChange={(next) => {
                setKind(trimmedEntityKindSchema.parse(next));
              }}
              disabled={isPending}
              aria-label="Entity kind"
            />
            {error === null ? null : <FieldError>{error}</FieldError>}
          </Field>
        </>
      )}
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={!isReady || isPending}
          onClick={() => {
            void handleAdd();
          }}
        >
          {target === "new" ? "Create Entity" : "Add"}
        </Button>
      </DialogFooter>
    </>
  );
}

/**
 * Add a found value as an Identifier at Unverified, citing the Job's Evidence: on an Entity
 * picked from the Case (Entities that already hold it are not offered), or on a new Entity
 * created with it in one write.
 */
export function AddFoundValueDialog({
  caseId,
  jobId,
  value,
  evidenceIds,
  onClose,
}: AddFoundValueDialogProps) {
  return (
    <Dialog
      open={value !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        {value === null ? null : (
          <AddFoundValueForm
            key={`${value.type}:${value.platform}:${value.value}`}
            caseId={caseId}
            jobId={jobId}
            value={value}
            evidenceIds={evidenceIds}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

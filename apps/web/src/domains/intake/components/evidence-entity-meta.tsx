import { Link } from "@tanstack/react-router";
import { PencilIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  useRecordsByIds,
  type PickerPort,
} from "@/shared/hooks/use-picker-source";
import { useWorkCase } from "@/shared/hooks/use-route-case";
import type { EntityOption } from "@/shared/ui/entity-combobox";
import { Button } from "@/shared/ui/primitives/button";
import { SearchedEntityCombobox } from "@/shared/ui/searched-entity-combobox";
import { WithTooltip } from "@/shared/ui/with-tooltip";
import {
  entityDisplayLabel,
  parseOptionalTrimmedUuid,
} from "@watchdog/schemas/shared";

function attachedEntityLabel(
  attachedId: string,
  entity: EntityOption | undefined
): string {
  if (parseOptionalTrimmedUuid(attachedId) === undefined) return "Unattached";
  if (entity === undefined) return "Unknown entity";
  return entityDisplayLabel({ name: entity.name, slug: entity.slug ?? "" });
}

type EvidenceEntityEditorProps = {
  attachedId: string;
  entityPort: PickerPort<EntityOption>;
  isAttaching: boolean;
  onAttachEntity: (entityId: string) => void;
  onClose: () => void;
};

function EvidenceEntityEditor({
  attachedId,
  entityPort,
  isAttaching,
  onAttachEntity,
  onClose,
}: EvidenceEntityEditorProps) {
  const editorRef = useRef<HTMLSpanElement>(null);

  function handleEntityChange(next: string) {
    onClose();
    if (next === attachedId) return;
    onAttachEntity(next);
  }

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (editorRef.current?.contains(target)) return;
      if (
        target instanceof Element &&
        target.closest("[data-slot=combobox-content]")
      ) {
        return;
      }
      onClose();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <span ref={editorRef} className="inline-flex items-center">
      <SearchedEntityCombobox
        port={entityPort}
        value={attachedId}
        onValueChange={handleEntityChange}
        emptyLabel="Unattached"
        aria-label="Attach to entity"
        disabled={isAttaching}
        autoFocus
        shouldShowClear={false}
        className="h-6 w-44 [&_[data-slot=input-group-addon]]:mr-0 [&_[data-slot=input-group-control]]:h-6"
      />
    </span>
  );
}

type EvidenceEntityMetaProps = {
  attachedId: string;
  entityPort: PickerPort<EntityOption>;
  isAttaching: boolean;
  isHidden: boolean;
  onAttachEntity?: (entityId: string) => void;
};

export function EvidenceEntityMeta({
  attachedId,
  entityPort,
  isAttaching,
  isHidden,
  onAttachEntity,
}: EvidenceEntityMetaProps) {
  const workCase = useWorkCase();
  const [isEditing, setIsEditing] = useState(false);
  const scopedAttachedId = parseOptionalTrimmedUuid(attachedId);
  const attached = useRecordsByIds(
    entityPort,
    scopedAttachedId === undefined ? [] : [scopedAttachedId]
  ).get(scopedAttachedId ?? "");
  const label = attachedEntityLabel(attachedId, attached);
  const canEdit = !isHidden && onAttachEntity !== undefined;

  function handleStartEdit() {
    setIsEditing(true);
  }

  const handleCloseEditor = useCallback(() => {
    setIsEditing(false);
  }, []);

  const slug = attached?.slug;
  const nameClass =
    scopedAttachedId === undefined
      ? "text-muted-foreground"
      : "text-foreground/80";
  const nameEl =
    slug !== undefined && slug !== "" ? (
      <Link
        to="/cases/$caseSlug/entities/$entitySlug"
        params={{ caseSlug: workCase.slug, entitySlug: slug }}
        className="text-foreground/80 hover:text-foreground underline-offset-2 hover:underline"
      >
        {label}
      </Link>
    ) : (
      <span className={nameClass}>{label}</span>
    );

  if (!canEdit || onAttachEntity === undefined) {
    return nameEl;
  }

  if (isEditing) {
    return (
      <EvidenceEntityEditor
        attachedId={attachedId}
        entityPort={entityPort}
        isAttaching={isAttaching}
        onAttachEntity={onAttachEntity}
        onClose={handleCloseEditor}
      />
    );
  }

  return (
    <span className="inline-flex min-w-0 items-center gap-0.5">
      {nameEl}
      <WithTooltip content="Change entity" shouldWrapSpan>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="-mr-1.5"
          aria-label="Change entity"
          disabled={isAttaching}
          onClick={handleStartEdit}
        >
          <PencilIcon className="size-3" aria-hidden />
        </Button>
      </WithTooltip>
    </span>
  );
}

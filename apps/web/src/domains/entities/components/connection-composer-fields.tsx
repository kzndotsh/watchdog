import type { ConnectionComposerValues } from "@/domains/entities/lib/connection-composer";
import { EntityCombobox, type EntityOption } from "@/shared/ui/entity-combobox";
import { FieldCombobox } from "@/shared/ui/field-combobox";
import { Field, FieldGroup, FieldLabel } from "@/shared/ui/shadcn/field";
import { Input } from "@/shared/ui/shadcn/input";
import {
  clampEdgePhrase,
  edgePhraseOptionsForPeers,
  edgePhraseValue,
  filterPeerOptionsForPhrase,
  parseEdgePhraseValue,
  peerKindAllowedForPhrase,
  preferredEdgePhrase,
} from "@/shared/ui/vocab/edge-predicate";
import type { EntityKind } from "@watchdog/schemas";
import { parseOptionalTrimmedUuid } from "@watchdog/schemas";

interface Props {
  centerKind: EntityKind;
  peerOptions: readonly EntityOption[];
  values: ConnectionComposerValues;
  onChange: (next: ConnectionComposerValues) => void;
  disabled?: boolean;
}

/**
 * Compact relationship + peer + related_to notes fields.
 * Shared by Entities table popover (dossier keeps full Dialog form).
 */
export function ConnectionComposerFields({
  centerKind,
  peerOptions,
  values,
  onChange,
  disabled = false,
}: Props) {
  const scopedPeerId = parseOptionalTrimmedUuid(values.peerId) ?? "";
  const peer = peerOptions.find((o) => o.id === scopedPeerId);
  const phraseOptions = edgePhraseOptionsForPeers(
    centerKind,
    peerOptions,
    peer?.kind
  );
  const filteredPeerOptions = filterPeerOptionsForPhrase(
    centerKind,
    peerOptions,
    values.phraseValue
  );
  const needsNotes =
    parseEdgePhraseValue(values.phraseValue)?.predicate === "related_to";

  function setPhrase(phraseValue: string) {
    const parsed = parseEdgePhraseValue(phraseValue);
    if (!parsed) {
      onChange({ ...values, phraseValue });
      return;
    }
    const currentPeer = peerOptions.find((o) => o.id === scopedPeerId);
    const peerStillValid =
      currentPeer?.kind !== undefined &&
      peerKindAllowedForPhrase(
        centerKind,
        currentPeer.kind,
        parsed.predicate,
        parsed.orientation
      );
    onChange({
      ...values,
      phraseValue,
      peerId: peerStillValid ? values.peerId : "",
    });
  }

  function setPeer(peerId: string) {
    const scopedId = parseOptionalTrimmedUuid(peerId) ?? "";
    const nextPeer = peerOptions.find((o) => o.id === scopedId);
    if (!nextPeer?.kind) {
      onChange({ ...values, peerId: scopedId, phraseValue: "" });
      return;
    }
    const peerKind = nextPeer.kind;
    const parsed = parseEdgePhraseValue(values.phraseValue);
    if (parsed) {
      const clamped = clampEdgePhrase(
        centerKind,
        peerKind,
        parsed.predicate,
        parsed.orientation
      );
      onChange({
        ...values,
        peerId: scopedId,
        phraseValue: edgePhraseValue(clamped.predicate, clamped.orientation),
      });
      return;
    }
    const preferred = preferredEdgePhrase(centerKind, peerKind);
    onChange({
      ...values,
      peerId: scopedId,
      phraseValue: preferred?.value ?? "",
    });
  }

  return (
    <FieldGroup className="gap-3">
      <Field className="gap-1.5">
        <FieldLabel className="text-xs">Relationship</FieldLabel>
        <FieldCombobox
          value={values.phraseValue}
          onValueChange={setPhrase}
          options={phraseOptions}
          placeholder="Search relationships…"
          emptyText="No matching relationships."
          disabled={disabled}
          className="w-full"
          aria-label="Connection relationship"
        />
      </Field>

      <Field className="gap-1.5">
        <FieldLabel className="text-xs">Peer</FieldLabel>
        <EntityCombobox
          entities={[...filteredPeerOptions]}
          value={values.peerId}
          onValueChange={setPeer}
          allowEmpty={false}
          emptyLabel="Select peer…"
          size="sm"
          aria-label="Connection peer"
          disabled={disabled}
        />
      </Field>

      {needsNotes ? (
        <Field className="gap-1.5">
          <FieldLabel className="text-xs" htmlFor="connection-notes">
            Notes
          </FieldLabel>
          <Input
            id="connection-notes"
            value={values.notes}
            onChange={(e) => {
              onChange({ ...values, notes: e.target.value });
            }}
            placeholder="Why related…"
            disabled={disabled}
            className="h-7 text-xs"
          />
        </Field>
      ) : null}
    </FieldGroup>
  );
}

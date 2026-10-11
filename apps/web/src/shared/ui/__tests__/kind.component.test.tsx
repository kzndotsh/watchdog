import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ClaimClassBadge } from "@/shared/ui/vocab/claim-class-badge";
import { EntityKindGlyph } from "@/shared/ui/vocab/entity-kind-glyph";
import { KindBadge } from "@/shared/ui/vocab/kind-badge";
import { isEntityKind, kindLabel } from "@/shared/ui/vocab/kind.lib";
import { ENTITY_KIND_LABELS } from "@watchdog/schemas/shared";

describe("kind vocab", () => {
  it("detects entity kinds and labels unknown values", () => {
    expect(isEntityKind("person")).toBe(true);
    expect(isEntityKind("unknown")).toBe(false);
    expect(kindLabel("email")).toBe("Email");
    expect(kindLabel("custom_kind")).toMatch(/Custom/);
  });

  it("renders kind and claim-class badges", () => {
    render(<KindBadge kind="person" />);
    expect(screen.getByText(ENTITY_KIND_LABELS.person)).toBeInTheDocument();

    render(<ClaimClassBadge claimClass="observation" />);
    expect(screen.getByText("Observation")).toBeInTheDocument();
  });

  it("renders entity kind glyph with type label", () => {
    render(<EntityKindGlyph kind="org" />);
    expect(screen.getByLabelText(ENTITY_KIND_LABELS.org)).toBeInTheDocument();
  });
});

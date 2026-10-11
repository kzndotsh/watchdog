import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EvidenceSlotSkeleton } from "@/shared/ui/intake/evidence-slot-skeleton";

describe("EvidenceSlotSkeleton", () => {
  it.each(["cite", "pick"] as const)(
    "announces loading through a status role in %s mode",
    (mode) => {
      render(<EvidenceSlotSkeleton mode={mode} />);
      expect(screen.getByRole("status")).toHaveTextContent("Loading evidence");
    }
  );
});

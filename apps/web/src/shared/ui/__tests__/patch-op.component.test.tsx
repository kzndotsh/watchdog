import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PatchOpBadge } from "@/shared/ui/vocab/patch-op";
import {
  patchOpLabel,
  PATCH_RESOURCE_META,
} from "@/shared/ui/vocab/patch-op.lib";
import { patchOpVerbLabel } from "@watchdog/schemas";

describe("patch-op vocab", () => {
  it("labels patch operations and resources", () => {
    expect(patchOpLabel("create")).toBe(patchOpVerbLabel("create"));
    expect(PATCH_RESOURCE_META.claim.label).toBe("Claim");
  });

  it("renders patch op badge copy", () => {
    render(<PatchOpBadge op="update" />);
    expect(screen.getByText("Update")).toBeInTheDocument();
  });
});

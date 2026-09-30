import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  CHIP_SIZE_CLASS,
  DetailStatusChip,
} from "@/shared/ui/detail-status-chip";

describe("DetailStatusChip", () => {
  it("renders badge content with shared chip sizing", () => {
    render(<DetailStatusChip size="sm">json</DetailStatusChip>);
    expect(screen.getByText("json")).toBeInTheDocument();
    expect(CHIP_SIZE_CLASS.sm).toContain("text-2xs font-medium");
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CapCapabilitySelect } from "@/domains/jobs/components/cap-capability-select";
import type { CapListItem } from "@/domains/jobs/types";
import { testCapProvider } from "@/testing/records";

const CAPS: CapListItem[] = [
  {
    id: "network.dns.lookup",
    version: "1",
    provider: testCapProvider,
    title: "DNS lookup",
    description: "Resolve host records",
    dataSource: "DNS",
    egress: "none",
    kind: "collect",
    useCases: ["Passive", "Footprint"],
    consumes: [{ kind: "host" }],
    input: {},
    inputForm: {},
  },
  {
    id: "web.page.enrich",
    version: "1",
    provider: testCapProvider,
    title: "Page enrich",
    egress: "third_party",
    kind: "collect",
    useCases: ["Active"],
    flags: ["invasive"],
    consumes: [{ kind: "url" }],
    input: {},
    inputForm: {},
  },
];

describe("CapCapabilitySelect", () => {
  it("renders the selected cap title in the combobox", () => {
    render(
      <CapCapabilitySelect
        caps={CAPS}
        value="network.dns.lookup"
        onValueChange={vi.fn()}
      />
    );

    expect(
      screen.getByRole("combobox", { name: "Capability" })
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("DNS lookup")).toBeInTheDocument();
  });

  it("shows the placeholder when no cap is selected", () => {
    render(
      <CapCapabilitySelect caps={CAPS} value="" onValueChange={vi.fn()} />
    );

    expect(screen.getByPlaceholderText("Select Cap…")).toBeInTheDocument();
  });

  it("selects a cap from the grouped list", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();

    render(
      <CapCapabilitySelect caps={CAPS} value="" onValueChange={onValueChange} />
    );

    await user.click(screen.getByRole("combobox", { name: "Capability" }));
    await user.click(screen.getByRole("option", { name: "Page enrich" }));

    expect(onValueChange).toHaveBeenCalledWith("web.page.enrich");
  });

  it("shows cap metadata in the preview panel", async () => {
    const user = userEvent.setup();

    render(
      <CapCapabilitySelect
        caps={CAPS}
        value="network.dns.lookup"
        onValueChange={vi.fn()}
      />
    );

    await user.click(screen.getByRole("combobox", { name: "Capability" }));

    expect(screen.getByText("Resolve host records")).toBeInTheDocument();
    expect(screen.getByText("network.dns.lookup")).toBeInTheDocument();
    expect(screen.getByText("Passive, Footprint")).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { JobCapRunForm } from "@/domains/jobs/components/job-cap-run-form";
import type { CapListItem } from "@/domains/jobs/types";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: { children: React.ReactNode }) => (
    <a {...props}>{children}</a>
  ),
}));

vi.mock("@/domains/jobs/components/cap-capability-select", () => ({
  CapCapabilitySelect: ({
    caps,
    value,
    onValueChange,
    disabled,
  }: {
    caps: readonly CapListItem[];
    value: string;
    onValueChange: (id: string) => void;
    disabled?: boolean;
  }) => (
    <select
      aria-label="Capability"
      disabled={disabled}
      value={value}
      onChange={(event) => {
        onValueChange(event.target.value);
      }}
    >
      <option value="">Select Cap…</option>
      {caps.map((cap) => (
        <option key={cap.id} value={cap.id}>
          {cap.title}
        </option>
      ))}
    </select>
  ),
}));

vi.mock("@/shared/ui/entity-combobox", () => ({
  EntityCombobox: () => null,
}));

const CAPS: CapListItem[] = [
  {
    id: "network.dns.lookup",
    version: "1",
    title: "DNS lookup",
    egress: "none",
    kind: "collect",
    useCases: ["Passive"],
    consumes: [{ kind: "host" }],
    input: {},
    inputForm: {},
  },
];

describe("JobCapRunForm", () => {
  it("renders cap filters and keeps Run disabled until input is ready", () => {
    render(
      <JobCapRunForm
        caps={CAPS}
        entities={[]}
        allowThirdPartyEgress
        configuredCredentials={new Set()}
        onRunCap={vi.fn()}
      />
    );

    expect(
      screen.getByRole("form", { name: "Run capability" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cap filters" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Run Capability" })
    ).toBeDisabled();
  });

  it("submits selected cap input through onRunCap", async () => {
    const onRunCap = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <JobCapRunForm
        caps={CAPS}
        entities={[]}
        allowThirdPartyEgress
        configuredCredentials={new Set()}
        onRunCap={onRunCap}
      />
    );

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Capability" }),
      "network.dns.lookup"
    );
    await user.type(screen.getByLabelText("Capability host"), "mailhost.test");
    await user.click(screen.getByRole("button", { name: "Run Capability" }));

    expect(onRunCap).toHaveBeenCalledWith({
      capabilityId: "network.dns.lookup",
      runInput: "mailhost.test",
      entityId: "",
    });
  });

  it("shows run errors from the parent", () => {
    render(
      <JobCapRunForm
        caps={CAPS}
        entities={[]}
        allowThirdPartyEgress
        configuredCredentials={new Set()}
        runError="Cap run failed"
        onRunCap={vi.fn()}
      />
    );

    expect(screen.getByText("Cap run failed")).toBeInTheDocument();
  });
});

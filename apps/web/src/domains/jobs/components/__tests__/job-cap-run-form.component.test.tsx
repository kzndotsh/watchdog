import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { CaseEgress } from "@/domains/cases/types";
import { JobCapRunForm } from "@/domains/jobs/components/job-cap-run-form";
import type { CapListItem } from "@/domains/jobs/types";
import { testCapProvider } from "@/testing/records";
import { testCaseId } from "@watchdog/schemas/testing";

const getDeletionPolicyFn = vi.hoisted(() => vi.fn());

vi.mock("@/domains/cases/cases.functions", () => ({
  updateCaseFn: vi.fn(),
  getDeletionPolicyFn,
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
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

const CASE_EGRESS = {
  id: testCaseId(1),
  slug: "alpha",
  allowedEgress: [
    "local",
    "target",
    "public_lookup",
    "account_lookup",
    "model",
  ],
} satisfies CaseEgress;

const CAPS: CapListItem[] = [
  {
    id: "network.dns.lookup",
    version: "1",
    provider: testCapProvider,
    title: "DNS lookup",
    egress: ["local"],
    contacts: [],
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
        caseEgress={CASE_EGRESS}
        configuredCredentials={new Set()}
        onRunCap={vi.fn()}
      />
    );

    expect(
      screen.getByRole("form", { name: "Run capability" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Advanced" })
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
        caseEgress={CASE_EGRESS}
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

  it("opens prefilled with a finished Job's Cap and input, ready to run", async () => {
    const onRunCap = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <JobCapRunForm
        caps={CAPS}
        entities={[]}
        caseEgress={CASE_EGRESS}
        configuredCredentials={new Set()}
        onRunCap={onRunCap}
        prefill={{
          capabilityId: "network.dns.lookup",
          runInput: "mailhost.test",
          entityId: "",
        }}
      />
    );

    expect(screen.getByRole("combobox", { name: "Capability" })).toHaveValue(
      "network.dns.lookup"
    );
    expect(screen.getByLabelText("Capability host")).toHaveValue(
      "mailhost.test"
    );

    await user.clear(screen.getByLabelText("Capability host"));
    await user.type(screen.getByLabelText("Capability host"), "fixed.test");
    await user.click(screen.getByRole("button", { name: "Run Capability" }));

    expect(onRunCap).toHaveBeenCalledWith({
      capabilityId: "network.dns.lookup",
      runInput: "fixed.test",
      entityId: "",
    });
  });

  it("keeps the prefilled Cap when its input reads as a kind the Cap does not consume", () => {
    const ipOnly: CapListItem = {
      id: "network.ip.lookup",
      version: "1",
      provider: testCapProvider,
      title: "IP lookup",
      egress: ["local"],
      contacts: [],
      kind: "collect",
      useCases: ["Passive"],
      consumes: [{ kind: "ip" }],
      input: {},
      inputForm: {},
    };

    render(
      <JobCapRunForm
        caps={[...CAPS, ipOnly]}
        entities={[]}
        caseEgress={CASE_EGRESS}
        configuredCredentials={new Set()}
        onRunCap={vi.fn()}
        prefill={{
          capabilityId: "network.ip.lookup",
          runInput: "mailhost.test",
          entityId: "",
        }}
      />
    );

    expect(screen.getByRole("combobox", { name: "Capability" })).toHaveValue(
      "network.ip.lookup"
    );
  });

  it("blocks a Cap whose egress the Case does not allow, naming where it would go", async () => {
    getDeletionPolicyFn.mockResolvedValue({
      restoreWindowDays: 30,
      canManage: true,
    });
    const onRunCap = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    const shodan: CapListItem = {
      id: "network.shodan.lookup",
      version: "1",
      provider: testCapProvider,
      title: "Shodan lookup",
      egress: ["account_lookup"],
      contacts: [{ kind: "provider", host: "api.shodan.io", access: "keyed" }],
      kind: "collect",
      consumes: [{ kind: "ip" }],
      input: {},
      inputForm: {},
    };

    render(
      <QueryClientProvider client={new QueryClient()}>
        <JobCapRunForm
          caps={[shodan]}
          entities={[]}
          caseEgress={{ ...CASE_EGRESS, allowedEgress: ["local", "target"] }}
          configuredCredentials={new Set()}
          onRunCap={onRunCap}
          prefill={{
            capabilityId: shodan.id,
            runInput: "9.9.9.9",
            entityId: "",
          }}
        />
      </QueryClientProvider>
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /does not allow Account lookups.*would contact api\.shodan\.io/
    );
    expect(
      await screen.findByRole("button", { name: "Allow Account lookups" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Run Capability" })
    ).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Run Capability" }));
    expect(onRunCap).not.toHaveBeenCalled();
  });

  it("shows run errors from the parent", () => {
    render(
      <JobCapRunForm
        caps={CAPS}
        entities={[]}
        caseEgress={CASE_EGRESS}
        configuredCredentials={new Set()}
        runError="Cap run failed"
        onRunCap={vi.fn()}
      />
    );

    expect(screen.getByText("Cap run failed")).toBeInTheDocument();
  });
});

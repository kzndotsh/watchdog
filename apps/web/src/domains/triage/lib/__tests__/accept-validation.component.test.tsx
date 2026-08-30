import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { CONFIRMED_REQUIRES_EVIDENCE } from "@/domains/dossier/lib/confirmed-evidence";
import { AcceptGateMessage } from "@/domains/triage/components/accept-gate-message";

describe("AcceptGateMessage", () => {
  it("shows the confirmed-requires-evidence text when the gate is blocked", async () => {
    const user = userEvent.setup();
    render(
      <AcceptGateMessage
        confirmedWithoutBundle={true}
        zeroEvidenceWarn={false}
      />
    );
    const message = screen.getByText(CONFIRMED_REQUIRES_EVIDENCE);
    await user.hover(message);
    expect(message).toBeInTheDocument();
  });

  it("hides the confirmed warning when the gate is open", () => {
    render(
      <AcceptGateMessage
        confirmedWithoutBundle={false}
        zeroEvidenceWarn={false}
      />
    );
    expect(screen.queryByText(CONFIRMED_REQUIRES_EVIDENCE)).toBeNull();
  });
});

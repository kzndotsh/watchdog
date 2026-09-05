import { beforeEach, describe, expect, it, vi } from "vitest";

const info = vi.fn();
const error = vi.fn();

vi.mock("@watchdog/log", () => ({
  peekRequestLogger: () => null,
  createLogger: () => ({ info, error }),
  maskEmail: (email: string) => email.replace(/@.*$/, "@…"),
}));

vi.mock("@watchdog/env/server", () => ({
  env: {
    BETTER_AUTH_URL: "http://127.0.0.1:3000",
    SMTP_HOST: undefined,
    SMTP_PORT: undefined,
    SMTP_USER: undefined,
    SMTP_PASS: undefined,
    SMTP_FROM: undefined,
  },
}));

const sendSmtpMail = vi.hoisted(() => vi.fn());

vi.mock("@/auth/smtp-mail", () => ({
  sendSmtpMail,
}));

import { sendInvitationEmail } from "@/auth/send-invitation-email";

describe("sendInvitationEmail", () => {
  beforeEach(() => {
    info.mockClear();
    error.mockClear();
    sendSmtpMail.mockClear();
  });

  it("logs an accept URL that contains the invitation id", async () => {
    const id = "22222222-2222-4222-8222-222222222222";
    await sendInvitationEmail({
      id,
      email: "invitee@mailhost.test",
      organization: { id: "org-1", name: "Watchdog" },
    });

    expect(info).toHaveBeenCalledWith(
      "organization invitation issued",
      expect.objectContaining({
        invite: expect.objectContaining({
          acceptUrl: `http://127.0.0.1:3000/auth/accept-invitation/${id}`,
          email: "invitee@…",
        }),
      })
    );
    expect(sendSmtpMail).not.toHaveBeenCalled();
  });
});

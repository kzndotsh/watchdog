import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const info = vi.fn();
const error = vi.fn();

vi.mock("@watchdog/log", () => ({
  peekRequestLogger: () => null,
  createLogger: () => ({ info, error }),
  maskEmail: (email: string) => email.replace(/^[^@]+/, "i***"),
}));

const mockEnv = vi.hoisted(() => ({
  BETTER_AUTH_URL: "http://127.0.0.1:3000",
  SMTP_HOST: undefined as string | undefined,
  SMTP_PORT: undefined as number | undefined,
  SMTP_USER: undefined as string | undefined,
  SMTP_PASS: undefined as string | undefined,
  SMTP_FROM: undefined as string | undefined,
}));

vi.mock("@watchdog/env/server", () => ({ env: mockEnv }));

const sendSmtpMail = vi.hoisted(() => vi.fn());

vi.mock("../smtp-mail", () => ({
  sendSmtpMail,
}));

import { sendInvitationEmail } from "../send-invitation-email";

const ID = "22222222-2222-4222-8222-222222222222";
const ACCEPT_URL = `http://127.0.0.1:3000/auth/accept-invitation/${ID}`;
const INVITATION = {
  id: ID,
  email: "invitee@mailhost.test",
  organization: { id: "org-1", name: "Watchdog" },
};

/** Everything the logger received, as one string a leaked URL cannot hide from. */
function everythingLogged(): string {
  return JSON.stringify([...info.mock.calls, ...error.mock.calls]);
}

describe("sendInvitationEmail", () => {
  beforeEach(() => {
    info.mockClear();
    error.mockClear();
    sendSmtpMail.mockReset();
  });

  afterEach(() => {
    mockEnv.SMTP_HOST = undefined;
    mockEnv.SMTP_FROM = undefined;
  });

  it("logs the invitation id and a masked email, never the accept URL", async () => {
    await sendInvitationEmail(INVITATION);

    expect(info).toHaveBeenCalledWith("organization invitation issued", {
      invitation: { id: ID, organizationId: "org-1" },
      invite: { email: "i***@mailhost.test" },
    });
    const logged = everythingLogged();
    expect(logged).not.toContain(ACCEPT_URL);
    expect(logged).not.toContain("accept-invitation");
    expect(logged).not.toContain("invitee@");
    expect(sendSmtpMail).not.toHaveBeenCalled();
  });

  it("puts the accept URL in the mail and still not in the log", async () => {
    mockEnv.SMTP_HOST = "smtp.mailhost.test";
    mockEnv.SMTP_FROM = "watchdog@mailhost.test";

    await sendInvitationEmail(INVITATION);

    expect(sendSmtpMail).toHaveBeenCalledOnce();
    expect(sendSmtpMail.mock.calls[0]?.[0]).toMatchObject({
      to: "invitee@mailhost.test",
      text: expect.stringContaining(ACCEPT_URL),
    });
    expect(everythingLogged()).not.toContain("accept-invitation");
  });

  it("keeps the URL out of the log when sending fails", async () => {
    mockEnv.SMTP_HOST = "smtp.mailhost.test";
    mockEnv.SMTP_FROM = "watchdog@mailhost.test";
    sendSmtpMail.mockRejectedValue(new Error("connect ECONNREFUSED"));

    await sendInvitationEmail(INVITATION);

    expect(error).toHaveBeenCalledOnce();
    expect(everythingLogged()).not.toContain(ACCEPT_URL);
  });
});

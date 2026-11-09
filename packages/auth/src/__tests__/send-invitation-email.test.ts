import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const info = vi.fn();
const error = vi.fn();

vi.mock("@watchdog/log", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@watchdog/log")>()),
  peekRequestLogger: () => null,
  createLogger: () => ({ info, error }),
}));

const mockEnv = vi.hoisted(() => ({
  BETTER_AUTH_URL: "http://127.0.0.1:3000",
  SMTP_HOST: undefined as string | undefined,
  SMTP_PORT: 587,
  SMTP_ALLOW_INSECURE: false,
  SMTP_USER: undefined as string | undefined,
  SMTP_PASS: undefined as string | undefined,
  SMTP_FROM: undefined as string | undefined,
}));

vi.mock("@watchdog/env/server", () => ({ env: mockEnv }));

const nodemailer = vi.hoisted(() => {
  const sendMail = vi.fn();
  const createTransport = vi.fn((_options: unknown) => ({ sendMail }));
  return { sendMail, createTransport };
});

vi.mock("nodemailer", () => ({ createTransport: nodemailer.createTransport }));

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
    nodemailer.sendMail.mockReset();
    nodemailer.createTransport.mockClear();
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
    expect(nodemailer.sendMail).not.toHaveBeenCalled();
  });

  it("puts the accept URL in the mail and still not in the log", async () => {
    mockEnv.SMTP_HOST = "smtp.mailhost.test";
    mockEnv.SMTP_FROM = "watchdog@mailhost.test";

    await sendInvitationEmail(INVITATION);

    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: "smtp.mailhost.test", port: 587 })
    );
    expect(nodemailer.sendMail).toHaveBeenCalledOnce();
    expect(nodemailer.sendMail.mock.calls[0]?.[0]).toMatchObject({
      from: "watchdog@mailhost.test",
      to: "invitee@mailhost.test",
      text: expect.stringContaining(ACCEPT_URL),
    });
    expect(everythingLogged()).not.toContain("accept-invitation");
  });

  it("keeps the URL out of the log when sending fails", async () => {
    mockEnv.SMTP_HOST = "smtp.mailhost.test";
    mockEnv.SMTP_FROM = "watchdog@mailhost.test";
    nodemailer.sendMail.mockRejectedValue(new Error("connect ECONNREFUSED"));

    await sendInvitationEmail(INVITATION);

    expect(error).toHaveBeenCalledOnce();
    expect(everythingLogged()).not.toContain(ACCEPT_URL);
  });
});

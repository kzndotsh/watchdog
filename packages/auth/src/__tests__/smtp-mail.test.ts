import { beforeEach, describe, expect, it, vi } from "vitest";

const nodemailer = vi.hoisted(() => {
  const sendMail = vi.fn();
  const createTransport = vi.fn((_options: unknown) => ({ sendMail }));
  return { sendMail, createTransport };
});

vi.mock("nodemailer", () => ({ createTransport: nodemailer.createTransport }));

import { sendSmtpMail } from "../smtp-mail";

const base = {
  host: "smtp.example.com",
  from: "wd@example.com",
  to: "a@example.com",
  subject: "s",
  text: "t",
};

function transportOptions(): Record<string, unknown> {
  return nodemailer.createTransport.mock.calls[0]?.[0] as Record<
    string,
    unknown
  >;
}

describe("sendSmtpMail transport security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses implicit TLS on 465", async () => {
    await sendSmtpMail({ ...base, port: 465 });
    expect(transportOptions()).toMatchObject({ secure: true });
  });

  it.each([587, 25, 2525])(
    "requires STARTTLS on port %s by default",
    async (port) => {
      await sendSmtpMail({ ...base, port });
      expect(transportOptions()).toMatchObject({
        secure: false,
        requireTLS: true,
      });
    }
  );

  it("sends without TLS only when the operator opts out", async () => {
    await sendSmtpMail({ ...base, port: 25, allowInsecure: true });
    expect(transportOptions().requireTLS).not.toBe(true);
    expect(transportOptions()).toMatchObject({ secure: false });
  });
});

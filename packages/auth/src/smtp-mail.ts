import { createTransport } from "nodemailer";

export async function sendSmtpMail(input: {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  from: string;
  /** Mail without TLS (`SMTP_ALLOW_INSECURE`): off, a port other than 465 must upgrade with STARTTLS. */
  allowInsecure?: boolean;
  to: string;
  subject: string;
  text: string;
}): Promise<void> {
  const transporter = createTransport({
    host: input.host,
    port: input.port,
    secure: input.port === 465,
    requireTLS: input.port !== 465 && input.allowInsecure !== true,
    auth:
      input.user !== undefined && input.pass !== undefined
        ? { user: input.user, pass: input.pass }
        : undefined,
  });
  await transporter.sendMail({
    from: input.from,
    to: input.to,
    subject: input.subject,
    text: input.text,
  });
}

import nodemailer from "nodemailer";

export async function sendSmtpMail(input: {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  from: string;
  to: string;
  subject: string;
  text: string;
}): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: input.host,
    port: input.port,
    secure: input.port === 465,
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

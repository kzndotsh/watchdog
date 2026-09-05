import { buildInvitationAcceptUrl } from "@/auth/invitation-url";
import { sendSmtpMail } from "@/auth/smtp-mail";
import { env } from "@watchdog/env/server";
import { createLogger, maskEmail, peekRequestLogger } from "@watchdog/log";

interface InvitationEmailData {
  id: string;
  email: string;
  organization: { id: string; name: string };
}

function invitationLogger() {
  return peekRequestLogger() ?? createLogger();
}

export async function sendInvitationEmail(
  data: InvitationEmailData
): Promise<void> {
  const acceptUrl = buildInvitationAcceptUrl(env.BETTER_AUTH_URL, data.id);
  const log = invitationLogger();
  log.info("organization invitation issued", {
    invitation: {
      id: data.id,
      organizationId: data.organization.id,
    },
    invite: {
      acceptUrl,
      email: maskEmail(data.email),
    },
  });

  const host = env.SMTP_HOST;
  const from = env.SMTP_FROM;
  if (!host || !from) return;

  try {
    await sendSmtpMail({
      host,
      port: env.SMTP_PORT ?? 587,
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
      from,
      to: data.email,
      subject: `Join ${data.organization.name} on Watchdog`,
      text: [
        `You're invited to join ${data.organization.name} on Watchdog.`,
        "",
        "Open this link to create an account (or sign in) and accept:",
        acceptUrl,
        "",
        "This invitation expires in 48 hours.",
      ].join("\n"),
    });
  } catch (error) {
    log.error(error instanceof Error ? error : new Error(String(error)));
  }
}

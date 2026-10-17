import { env } from "@watchdog/env/server";
import { createLogger, maskEmail, peekRequestLogger } from "@watchdog/log";

import { buildInvitationAcceptUrl } from "./invitation-url";
import { sendSmtpMail } from "./smtp-mail";

type InvitationEmailData = {
  id: string;
  email: string;
  organization: { id: string; name: string };
};

function invitationLogger() {
  return peekRequestLogger() ?? createLogger();
}

export async function sendInvitationEmail(
  data: InvitationEmailData
): Promise<void> {
  const log = invitationLogger();
  // The accept URL is a capability link (whoever holds it can start accepting), and logs are
  // read by more people than the invitation is meant for, so it never reaches one: the id and
  // the masked address are enough to find the invitation. The link is in Settings, Organization,
  // Members (Copy link) and in the mail when SMTP is set.
  log.info("organization invitation issued", {
    invitation: {
      id: data.id,
      organizationId: data.organization.id,
    },
    invite: {
      email: maskEmail(data.email),
    },
  });

  const host = env.SMTP_HOST;
  const from = env.SMTP_FROM;
  if (!host || !from) return;
  const acceptUrl = buildInvitationAcceptUrl(env.BETTER_AUTH_URL, data.id);

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

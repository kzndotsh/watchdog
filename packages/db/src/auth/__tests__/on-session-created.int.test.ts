import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { withTestTx } from "@watchdog/test-kit/db";

import {
  authEvent,
  member,
  organization,
  session,
  user,
} from "../../schema/auth";
import { insertAuthEvent } from "../auth-events";
import { onAuthSessionCreated } from "../on-session-created";

async function insertAuthUser(
  tx: Parameters<typeof onAuthSessionCreated>[0],
  id: string,
  email: string
) {
  await tx.insert(user).values({
    id,
    name: "Session",
    email,
    emailVerified: false,
  });
}

describe("insertAuthEvent", () => {
  it("stores session.created with ip and user agent", async () => {
    await withTestTx(async (tx) => {
      const userId = crypto.randomUUID();
      await insertAuthUser(tx, userId, `${userId}@example.test`);

      await insertAuthEvent(tx, {
        userId,
        kind: "session.created",
        ipAddress: "127.0.0.1",
        userAgent: "vitest",
      });

      const rows = await tx
        .select()
        .from(authEvent)
        .where(eq(authEvent.userId, userId));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.kind).toBe("session.created");
      expect(rows[0]?.ipAddress).toBe("127.0.0.1");
      expect(rows[0]?.userAgent).toBe("vitest");
    });
  });
});

async function insertSession(
  tx: Parameters<typeof onAuthSessionCreated>[0],
  sessionId: string,
  userId: string
) {
  await tx.insert(session).values({
    id: sessionId,
    expiresAt: new Date(Date.now() + 60_000),
    token: crypto.randomUUID(),
    userId,
  });
}

describe("onAuthSessionCreated", () => {
  it("starts the session in the user's organization and records session.created", async () => {
    await withTestTx(async (tx) => {
      const userId = crypto.randomUUID();
      const sessionId = crypto.randomUUID();
      const organizationId = crypto.randomUUID();
      await insertAuthUser(tx, userId, `${userId}@example.test`);
      await tx.insert(organization).values({
        id: organizationId,
        name: "Acme",
        slug: `acme-${organizationId}`,
        createdAt: new Date(),
      });
      await tx.insert(member).values({
        id: crypto.randomUUID(),
        organizationId,
        userId,
        role: "owner",
        createdAt: new Date(),
      });
      await insertSession(tx, sessionId, userId);

      await onAuthSessionCreated(tx, {
        id: sessionId,
        userId,
        ipAddress: "10.0.0.2",
        userAgent: "hook-test",
      });

      const [row] = await tx
        .select()
        .from(session)
        .where(eq(session.id, sessionId));
      expect(row?.activeOrganizationId).toBe(organizationId);

      const events = await tx
        .select()
        .from(authEvent)
        .where(eq(authEvent.userId, userId));
      expect(events).toHaveLength(1);
      expect(events[0]?.kind).toBe("session.created");
      expect(events[0]?.ipAddress).toBe("10.0.0.2");
    });
  });

  it("leaves the session without an organization for a user with no membership", async () => {
    await withTestTx(async (tx) => {
      const userId = crypto.randomUUID();
      const sessionId = crypto.randomUUID();
      await insertAuthUser(tx, userId, `${userId}@example.test`);
      await insertSession(tx, sessionId, userId);

      await onAuthSessionCreated(tx, { id: sessionId, userId });

      const [row] = await tx
        .select()
        .from(session)
        .where(eq(session.id, sessionId));
      expect(row?.activeOrganizationId).toBeNull();
    });
  });
});

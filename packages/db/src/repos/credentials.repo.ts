import { and, eq } from "drizzle-orm";

import { trimmedOrNull, trimmedOrUndefined } from "@watchdog/schemas";

import type { DbExec } from "../exec";
import { credentials } from "../schema/credentials";
import { trimResourceId } from "./_scoped-ids";

export const credentialMetaColumns = {
  id: credentials.id,
  name: credentials.name,
  label: credentials.label,
  updatedAt: credentials.updatedAt,
} as const;

export type CredentialMetaRow = {
  [
    K in keyof typeof credentialMetaColumns
  ]: (typeof credentials.$inferSelect)[K &
    keyof typeof credentials.$inferSelect];
};

export type NewCredential = Pick<
  typeof credentials.$inferInsert,
  "userId" | "name" | "ciphertext"
> &
  Partial<Pick<typeof credentials.$inferInsert, "label">>;

export const credentialsRepo = {
  async listMeta(exec: DbExec, userId: string): Promise<CredentialMetaRow[]> {
    return exec
      .select(credentialMetaColumns)
      .from(credentials)
      .where(eq(credentials.userId, userId));
  },

  async getIdByName(
    exec: DbExec,
    userId: string,
    name: string
  ): Promise<string | null> {
    const scopedName = trimmedOrUndefined(name);
    if (scopedName === undefined) return null;
    const [row] = await exec
      .select({ id: credentials.id })
      .from(credentials)
      .where(
        and(eq(credentials.userId, userId), eq(credentials.name, scopedName))
      )
      .limit(1);
    return row?.id ?? null;
  },

  async getCiphertext(
    exec: DbExec,
    userId: string,
    name: string
  ): Promise<Buffer | null> {
    const scopedName = trimmedOrUndefined(name);
    if (scopedName === undefined) return null;
    const [row] = await exec
      .select({ ciphertext: credentials.ciphertext })
      .from(credentials)
      .where(
        and(eq(credentials.userId, userId), eq(credentials.name, scopedName))
      )
      .limit(1);
    return row?.ciphertext ?? null;
  },

  async create(
    exec: DbExec,
    values: NewCredential
  ): Promise<CredentialMetaRow | null> {
    const scopedName = trimmedOrUndefined(values.name);
    if (scopedName === undefined) return null;
    const label =
      values.label === undefined ? undefined : trimmedOrNull(values.label);
    const [created] = await exec
      .insert(credentials)
      .values({ ...values, name: scopedName, label })
      .returning(credentialMetaColumns);
    return created ?? null;
  },

  async update(
    exec: DbExec,
    credentialId: string,
    values: {
      ciphertext: Buffer;
      label: string | null;
    }
  ): Promise<CredentialMetaRow | null> {
    const scopedId = trimResourceId(credentialId);
    if (scopedId === undefined) return null;
    const [updated] = await exec
      .update(credentials)
      .set({ ...values, label: trimmedOrNull(values.label) })
      .where(eq(credentials.id, scopedId))
      .returning(credentialMetaColumns);
    return updated ?? null;
  },

  async deleteByName(
    exec: DbExec,
    userId: string,
    name: string
  ): Promise<boolean> {
    const scopedName = trimmedOrUndefined(name);
    if (scopedName === undefined) return false;
    const deleted = await exec
      .delete(credentials)
      .where(
        and(eq(credentials.userId, userId), eq(credentials.name, scopedName))
      )
      .returning({ id: credentials.id });
    return deleted.length > 0;
  },
};

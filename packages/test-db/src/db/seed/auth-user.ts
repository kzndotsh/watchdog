import { user, type DbExec } from "@watchdog/db";

export async function seedAuthUser(
  exec: DbExec,
  values: { id: string; name: string; email: string }
): Promise<void> {
  await exec.insert(user).values({
    id: values.id,
    name: values.name,
    email: values.email,
    emailVerified: false,
  });
}

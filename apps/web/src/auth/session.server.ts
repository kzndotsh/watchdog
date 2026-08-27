import "@tanstack/react-start/server-only";
import { getRequestHeaders } from "@tanstack/react-start/server";

import { auth } from "@/auth/server";
import { UnauthorizedError } from "@/auth/unauthorized-error";

export async function readSession() {
  const headers = getRequestHeaders();
  return await auth.api.getSession({ headers });
}

export async function requireSession() {
  const session = await readSession();
  if (!session) {
    throw new UnauthorizedError();
  }
  return session;
}

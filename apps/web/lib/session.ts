import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME, getUserForSessionToken } from "@repo/core";

// The real authorization boundary (runs in the Node.js runtime, unlike
// middleware.ts's Edge-only cookie-presence check). Call this at the top of
// every protected server component / route handler.
export async function requireUser() {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const user = token ? await getUserForSessionToken(token) : null;
  if (!user) {
    redirect("/login");
  }
  return user;
}

export async function getCurrentUser() {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  return token ? getUserForSessionToken(token) : null;
}

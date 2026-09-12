import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { deleteSessionForToken, SESSION_COOKIE_NAME } from "@repo/core";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await deleteSessionForToken(token);
  }
  cookieStore.delete(SESSION_COOKIE_NAME);
  return NextResponse.json({ ok: true });
}

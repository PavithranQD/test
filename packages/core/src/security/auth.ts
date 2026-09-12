import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@repo/db";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Phase 1 has exactly one admin account, defined by env vars rather than a
// signup flow. The User row is upserted on first successful login so
// ChatSession/Session foreign keys have something to point at.
export async function verifyAdminCredentials(email: string, password: string): Promise<boolean> {
  const expectedEmail = process.env.ADMIN_EMAIL;
  const expectedHash = process.env.ADMIN_PASSWORD_HASH;
  if (!expectedEmail || !expectedHash) {
    throw new Error("ADMIN_EMAIL / ADMIN_PASSWORD_HASH env vars are not set");
  }
  if (email.toLowerCase() !== expectedEmail.toLowerCase()) {
    return false;
  }
  return bcrypt.compare(password, expectedHash);
}

export async function createSessionForAdmin(email: string): Promise<{ token: string; expiresAt: Date }> {
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash: "", role: "ADMIN" },
  });

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.session.create({
    data: { userId: user.id, tokenHash: hashToken(token), expiresAt },
  });

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  return { token, expiresAt };
}

export async function getUserForSessionToken(token: string) {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) {
    return null;
  }
  return session.user;
}

export async function deleteSessionForToken(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

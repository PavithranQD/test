// Kept dependency-free (no node:crypto, no bcrypt, no Prisma) so Edge
// runtime code (apps/web/middleware.ts) can import just this constant
// without pulling in Node-only modules that Edge's webpack bundle can't
// handle.
export const SESSION_COOKIE_NAME = "session_token";

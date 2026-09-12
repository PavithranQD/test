import bcrypt from "bcryptjs";

// `npm run hash-password --workspace=apps/worker -- <password>`
// Prints a bcrypt hash to paste into ADMIN_PASSWORD_HASH in .env.
const password = process.argv[2];
if (!password) {
  console.error("Usage: npm run hash-password --workspace=apps/worker -- <password>");
  process.exit(1);
}

console.log(bcrypt.hashSync(password, 12));

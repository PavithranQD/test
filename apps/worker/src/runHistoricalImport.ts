import path from "node:path";
import dotenv from "dotenv";
// `npm run import --workspace=apps/worker` runs with apps/worker as the
// working directory, not the repo root — dotenv's default "load .env from
// cwd" behavior would silently find nothing there. Load it from the repo
// root explicitly instead, regardless of where this script is invoked from.
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

import { prisma } from "@repo/db";
import { getActiveStore, runHistoricalImport, logger } from "@repo/core";

// One-off CLI: `npm run import --workspace=apps/worker`
// Requires the store to already be connected via the web app's /settings
// page (custom app token entered + validated there first).
async function main() {
  const store = await getActiveStore();
  if (!store) {
    logger.error("No connected store found. Connect a store via the web app's /settings page first.");
    process.exit(1);
  }

  logger.info({ shopDomain: store.shopDomain }, "Starting historical import");
  await runHistoricalImport(store.id);
  logger.info({ shopDomain: store.shopDomain }, "Historical import complete");
}

main()
  .catch((err) => {
    logger.error(err, "Historical import failed");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

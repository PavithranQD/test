import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@repo/db";
import { getActiveStore, decryptSecret, verifyShopifyWebhookHmac, WEBHOOK_HANDLERS, computeDailyMetrics, logger } from "@repo/core";

// Must run on the Node.js runtime (not Edge) -- needs node:crypto for HMAC
// verification and Prisma for the DB writes triggered by handlers.
export const runtime = "nodejs";

// Dispatch is driven entirely by the X-Shopify-Topic header, not the
// [topic] URL segment (which is only for readability/debugging in logs --
// see register.ts).
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const hmacHeader = request.headers.get("x-shopify-hmac-sha256");
  const topic = request.headers.get("x-shopify-topic");

  const store = await getActiveStore();
  if (!store) {
    return NextResponse.json({ error: "No connected store" }, { status: 404 });
  }

  const apiSecret = decryptSecret(store.apiSecretCiphertext);
  if (!verifyShopifyWebhookHmac(rawBody, hmacHeader, apiSecret)) {
    logger.warn({ topic }, "Webhook HMAC verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payloadHash = createHash("sha256").update(rawBody).digest("hex");

  // Shopify retries webhooks it doesn't get a fast 2xx for, so the same
  // payload can arrive more than once -- dedupe before doing any work.
  const existing = await prisma.webhookEvent.findUnique({
    where: { storeId_payloadHash: { storeId: store.id, payloadHash } },
  });
  if (existing) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  const webhookEvent = await prisma.webhookEvent.create({
    data: { storeId: store.id, topic: topic ?? "unknown", payloadHash, status: "RECEIVED" },
  });

  const handler = topic ? WEBHOOK_HANDLERS[topic] : undefined;
  if (!handler) {
    logger.warn({ topic }, "No handler registered for webhook topic");
    await prisma.webhookEvent.update({ where: { id: webhookEvent.id }, data: { status: "IGNORED" } });
    return NextResponse.json({ ok: true, ignored: true });
  }

  try {
    const payload = JSON.parse(rawBody);
    await handler(store.id, payload);
    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: { status: "PROCESSED", processedAt: new Date() },
    });

    // Keep "today" fresh in near-real-time rather than waiting for the
    // nightly job -- cheap (single day, single store), so awaiting it here
    // is simpler to reason about than a detached background task.
    try {
      await computeDailyMetrics(store.id, new Date());
    } catch (metricsErr) {
      logger.error(metricsErr, "Incremental metrics recompute failed");
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error({ err, topic }, "Webhook handler failed");
    await prisma.webhookEvent.update({ where: { id: webhookEvent.id }, data: { status: "FAILED" } });
    // 500 so Shopify retries -- reconciliation is a backstop, not the
    // primary path, for genuinely transient failures.
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
}

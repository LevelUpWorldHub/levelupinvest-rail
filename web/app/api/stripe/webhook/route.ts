import { drizzleRepo } from "@/db/repo";
import { requireEnv } from "@/env";
import { stripe } from "@/lib/stripe";
import { handleEvent, verifyEvent } from "@/lib/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const raw = await req.text(); // raw body is required for signature verification
  let event;
  try {
    event = verifyEvent(stripe(), raw, req.headers.get("stripe-signature"), requireEnv("STRIPE_WEBHOOK_SECRET"));
  } catch {
    return new Response("invalid signature", { status: 400 });
  }
  try {
    const result = await handleEvent(stripe(), drizzleRepo, event);
    return Response.json({ received: true, result });
  } catch (e) {
    console.error("webhook handling failed", event.id, event.type, (e as Error).message);
    return new Response("handler error", { status: 500 }); // Stripe retries
  }
}

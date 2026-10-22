import { z } from "zod";
import { drizzleRepo } from "@/db/repo";
import { BillingInputError, createCheckoutSession } from "@/lib/billing";
import { stripe } from "@/lib/stripe";
import { json, sessionContext } from "@/server";

const Body = z.object({ interval: z.enum(["monthly", "yearly"]) });

export async function POST(req: Request) {
  const ctx = await sessionContext();
  if (!ctx) return json({ error: "unauthenticated" }, 401);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "bad_request" }, 400);
  const priceId = (parsed.data.interval === "monthly" ? process.env.STRIPE_PRICE_PRO_MONTHLY : process.env.STRIPE_PRICE_PRO_YEARLY)?.trim();
  if (!priceId) return json({ error: "price_not_configured" }, 503);
  try {
    return json({ url: await createCheckoutSession(stripe(), drizzleRepo, ctx.user, priceId) });
  } catch (e) {
    if (e instanceof BillingInputError) return json({ error: e.message }, 409);
    throw e;
  }
}

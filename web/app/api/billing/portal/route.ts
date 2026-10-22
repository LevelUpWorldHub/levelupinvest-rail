import { drizzleRepo } from "@/db/repo";
import { BillingInputError, createPortalSession } from "@/lib/billing";
import { stripe } from "@/lib/stripe";
import { json, sessionContext } from "@/server";

export async function POST() {
  const ctx = await sessionContext();
  if (!ctx) return json({ error: "unauthenticated" }, 401);
  try {
    return json({ url: await createPortalSession(stripe(), drizzleRepo, ctx.user.id) });
  } catch (e) {
    if (e instanceof BillingInputError) return json({ error: e.message }, 409);
    throw e;
  }
}

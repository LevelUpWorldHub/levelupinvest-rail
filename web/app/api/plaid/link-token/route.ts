import { EntitlementError } from "@/lib/entitlements";
import { createLinkToken, PlaidNotConfiguredError, sandboxClient } from "@/lib/plaid";
import { json, sessionContext } from "@/server";

export async function POST() {
  const ctx = await sessionContext();
  if (!ctx) return json({ error: "unauthenticated" }, 401);
  try {
    return json({ linkToken: await createLinkToken(sandboxClient(), ctx.user.id, ctx.plan) });
  } catch (e) {
    if (e instanceof EntitlementError) return json({ error: "upgrade_required" }, 402);
    if (e instanceof PlaidNotConfiguredError) return json({ error: "plaid_not_configured" }, 503);
    throw e;
  }
}

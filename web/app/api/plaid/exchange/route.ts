import { z } from "zod";
import { drizzleRepo } from "@/db/repo";
import { loadKey } from "@/lib/crypto";
import { EntitlementError } from "@/lib/entitlements";
import { exchangeAndStore, PlaidNotConfiguredError, sandboxClient } from "@/lib/plaid";
import { json, sessionContext } from "@/server";

const Body = z.object({ publicToken: z.string().min(10).max(200), institutionName: z.string().max(120).nullable().optional() });

export async function POST(req: Request) {
  const ctx = await sessionContext();
  if (!ctx) return json({ error: "unauthenticated" }, 401);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "bad_request" }, 400);
  try {
    const item = await exchangeAndStore(
      sandboxClient(), drizzleRepo, loadKey(), ctx.user.id, ctx.plan,
      parsed.data.publicToken, parsed.data.institutionName ?? null,
    );
    return json({ item });
  } catch (e) {
    if (e instanceof EntitlementError) return json({ error: "upgrade_required" }, 402);
    if (e instanceof PlaidNotConfiguredError) return json({ error: "plaid_not_configured" }, 503);
    throw e;
  }
}

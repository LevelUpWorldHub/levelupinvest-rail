import { drizzleRepo } from "@/db/repo";
import { loadKey } from "@/lib/crypto";
import { buildInsights } from "@/lib/insights";
import { providerForUser } from "@/lib/plaid";
import { MOCK_DEFAULT_AS_OF } from "@rail/providers/mock";
import { json, sessionContext } from "@/server";

export async function GET() {
  const ctx = await sessionContext();
  if (!ctx) return json({ error: "unauthenticated" }, 401);
  const keys = ctx.plan === "pro" && process.env.TOKEN_ENCRYPTION_KEY ? [loadKey()] : [];
  const { provider, source } = await providerForUser(drizzleRepo, keys, ctx.user.id, ctx.plan);
  const end = source === "mock" ? MOCK_DEFAULT_AS_OF : new Date().toISOString().slice(0, 10);
  const start = new Date(Date.parse(end) - 90 * 864e5).toISOString().slice(0, 10);
  return json({ plan: ctx.plan, source, ...(await buildInsights(provider, ctx.plan, start, end)) });
}

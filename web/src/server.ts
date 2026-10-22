import { currentUser } from "./auth";
import { drizzleRepo } from "./db/repo";
import { planFor, type Plan } from "./lib/entitlements";

export async function sessionContext(): Promise<{ user: { id: string; email: string | null }; plan: Plan } | null> {
  const user = await currentUser();
  if (!user) return null;
  const sub = await drizzleRepo.getSubscription(user.id);
  return { user, plan: planFor(sub) };
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

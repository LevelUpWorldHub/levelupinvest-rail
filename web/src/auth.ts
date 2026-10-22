import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "./db";
import { accounts, sessions, users, verificationTokens } from "./db/schema";

/**
 * Auth.js v5, passwordless email magic link (Resend). No passwords stored.
 * Database sessions (revocable) via the Drizzle adapter.
 * Env: AUTH_SECRET, AUTH_RESEND_KEY, AUTH_EMAIL_FROM, DATABASE_URL.
 */
export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  adapter: DrizzleAdapter(db(), {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "database" },
  providers: [Resend({ from: process.env.AUTH_EMAIL_FROM })],
  pages: { signIn: "/login" },
  trustHost: true,
}));

export async function currentUser(): Promise<{ id: string; email: string | null } | null> {
  const s = await auth();
  const id = s?.user?.id;
  return id ? { id, email: s.user?.email ?? null } : null;
}

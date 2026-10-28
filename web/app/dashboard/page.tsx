import { redirect } from "next/navigation";
import { sessionContext } from "@/server";
import { can } from "@/lib/entitlements";
import { DashboardClient } from "./DashboardClient";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const ctx = await sessionContext();
  if (!ctx) redirect("/login");
  return (
    <main>
      <h1>Dashboard</h1>
      <p>Signed in as {ctx.user.email} · Plan: <b>{ctx.plan}</b></p>
      <DashboardClient canLink={can(ctx.plan, "link_bank")} isPro={ctx.plan === "pro"} />
    </main>
  );
}

import { CheckoutButton } from "./CheckoutButton";
import { PLAN_FEATURES } from "@/lib/entitlements";

// PLACEHOLDER pricing copy. Real amounts live on the Stripe Prices referenced by env.
export default function Pricing() {
  return (
    <main>
      <h1>Plans</h1>
      <p style={{ color: "#a00" }}>Draft pricing — placeholder until Level Up Inc sets final prices.</p>
      <div style={{ display: "flex", gap: 24 }}>
        <section style={{ border: "1px solid #ccc", padding: 16, flex: 1 }}>
          <h2>Free</h2>
          <ul>{PLAN_FEATURES.free.map((f) => <li key={f}>{f}</li>)}</ul>
        </section>
        <section style={{ border: "1px solid #333", padding: 16, flex: 1 }}>
          <h2>Pro</h2>
          <ul>{PLAN_FEATURES.pro.map((f) => <li key={f}>{f}</li>)}</ul>
          <CheckoutButton interval="monthly" label="Go Pro (monthly)" />{" "}
          <CheckoutButton interval="yearly" label="Go Pro (yearly)" />
        </section>
      </div>
    </main>
  );
}

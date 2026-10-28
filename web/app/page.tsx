import Link from "next/link";

export default function Home() {
  return (
    <main>
      <h1>See where your money goes. Nothing more, nothing less.</h1>
      <p>Budgets, spending breakdowns, recurring bills, savings-goal projections and net worth — strictly read-only.</p>
      <p><Link href="/login">Sign in with email</Link> · <Link href="/pricing">See plans</Link></p>
    </main>
  );
}

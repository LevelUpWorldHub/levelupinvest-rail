export default function Privacy() {
  return (
    <main>
      <p style={{ background: "#fee", padding: 12, border: "2px solid #a00" }}>
        <b>DRAFT — NOT LEGAL ADVICE — REQUIRES REVIEW BY QUALIFIED COUNSEL BEFORE PUBLIC LAUNCH.</b> Placeholder text only.
      </p>
      <h1>Privacy Policy (draft)</h1>
      <p>[PLACEHOLDER] Level Up Inc (&quot;we&quot;) operates LevelUpInvest.</p>
      <h2>What we collect</h2>
      <ul>
        <li>Account: your email address (for sign-in links).</li>
        <li>Billing: handled by Stripe; we store a Stripe customer ID and subscription status, never full card numbers.</li>
        <li>Linked accounts (Pro): via Plaid, read-only account, balance and transaction data. Plaid access tokens are encrypted at rest.</li>
      </ul>
      <h2>What we never do</h2>
      <p>We never move money, initiate transfers or place trades. [PLACEHOLDER: data sale/sharing statement, retention periods, deletion requests, CCPA/GLBA applicability, Plaid end-user privacy policy link, contact address.]</p>
    </main>
  );
}

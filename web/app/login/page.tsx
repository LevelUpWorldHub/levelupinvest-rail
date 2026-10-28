import { signIn } from "@/auth";

export default function Login() {
  async function send(formData: FormData) {
    "use server";
    await signIn("resend", { email: String(formData.get("email") ?? ""), redirectTo: "/dashboard" });
  }
  return (
    <main>
      <h1>Sign in</h1>
      <p>We&apos;ll email you a one-time sign-in link. No password.</p>
      <form action={send}>
        <input name="email" type="email" required placeholder="you@example.com" />
        <button type="submit">Email me a link</button>
      </form>
    </main>
  );
}

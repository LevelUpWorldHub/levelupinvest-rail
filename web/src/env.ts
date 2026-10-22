/**
 * Env access. Every secret comes from process.env only; nothing is hard-coded.
 * Values are read lazily so `next build` works without secrets present.
 */
export class MissingEnvError extends Error {
  constructor(name: string) {
    super(`Missing required environment variable: ${name}`);
    this.name = "MissingEnvError";
  }
}

export function requireEnv(name: string, env: Record<string, string | undefined> = process.env): string {
  const v = env[name]?.trim();
  if (!v) throw new MissingEnvError(name);
  return v;
}

export function optionalEnv(name: string, env: Record<string, string | undefined> = process.env): string | undefined {
  const v = env[name]?.trim();
  return v ? v : undefined;
}

export function appUrl(env: Record<string, string | undefined> = process.env): string {
  return (optionalEnv("APP_URL", env) ?? "http://localhost:3000").replace(/\/$/, "");
}

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { requireEnv } from "../env";

/**
 * AES-256-GCM envelope for Plaid access tokens at rest.
 * Format: "<keyId>:<iv b64>:<tag b64>:<ciphertext b64>".
 * The owning userId is bound as AAD, so a ciphertext copied onto another
 * user's row fails to decrypt (defence in depth for per-user isolation).
 */
export interface EncryptionKey {
  id: string;
  key: Buffer;
}

export function loadKey(env: Record<string, string | undefined> = process.env): EncryptionKey {
  const raw = Buffer.from(requireEnv("TOKEN_ENCRYPTION_KEY", env), "base64");
  if (raw.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must be base64 of exactly 32 bytes");
  const id = env.TOKEN_ENCRYPTION_KEY_ID?.trim() || "v1";
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(id)) throw new Error("TOKEN_ENCRYPTION_KEY_ID must be [A-Za-z0-9_-]{1,32}");
  return { id, key: raw };
}

export function encryptSecret(plaintext: string, userId: string, k: EncryptionKey): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k.key, iv);
  cipher.setAAD(Buffer.from(userId, "utf8"));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [k.id, iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(":");
}

export function decryptSecret(envelope: string, userId: string, keys: EncryptionKey[]): string {
  const parts = envelope.split(":");
  if (parts.length !== 4) throw new Error("Malformed ciphertext");
  const [id, ivB64, tagB64, ctB64] = parts as [string, string, string, string];
  const k = keys.find((x) => x.id === id);
  if (!k) throw new Error(`No decryption key for key id ${id}`);
  const decipher = createDecipheriv("aes-256-gcm", k.key, Buffer.from(ivB64, "base64"));
  decipher.setAAD(Buffer.from(userId, "utf8"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
}

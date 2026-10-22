import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { requireEnv } from "../env";
import * as schema from "./schema";

let _db: PostgresJsDatabase<typeof schema> | null = null;

/** Lazily connects so builds don't need DATABASE_URL. */
export function db(): PostgresJsDatabase<typeof schema> {
  if (!_db) {
    const client = postgres(requireEnv("DATABASE_URL"), { prepare: false, max: 5 });
    _db = drizzle(client, { schema });
  }
  return _db;
}
export { schema };

import { readFile, readdir } from "node:fs/promises";
import pg from "pg";
import { connectionString } from "../server/connection.mjs";

if (!process.env.DATABASE_URL_UNPOOLED)
  throw new Error("DATABASE_URL_UNPOOLED não configurada.");
const client = new pg.Client({
  connectionString: connectionString(process.env.DATABASE_URL_UNPOOLED),
});
await client.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(7814351)");
  await client.query("CREATE SCHEMA IF NOT EXISTS famac");
  await client.query(
    "CREATE TABLE IF NOT EXISTS famac.migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  const directory = new URL("../server/migrations/", import.meta.url);
  for (const name of (await readdir(directory))
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    const exists = await client.query(
      "SELECT 1 FROM famac.migrations WHERE name=$1",
      [name],
    );
    if (exists.rowCount) continue;
    await client.query(await readFile(new URL(name, directory), "utf8"));
    await client.query("INSERT INTO famac.migrations(name) VALUES ($1)", [
      name,
    ]);
    console.log(`PASS: migração ${name}`);
  }
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}

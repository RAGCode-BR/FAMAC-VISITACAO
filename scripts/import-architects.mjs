import { readFile, writeFile, mkdir } from "node:fs/promises";
import pg from "pg";
import { connectionString } from "../server/connection.mjs";
import { validateRecord } from "../server/policy.mjs";
import {
  planArchitects,
  architectKey,
  normalizeContact,
} from "./architect-import-plan.mjs";

const input = process.argv[2];
if (!input)
  throw new Error("Informe o JSON local produzido por read-architects.ps1.");
const excludeAt = process.argv.indexOf("--exclude");
if (excludeAt < 0 || !process.argv[excludeAt + 1])
  throw new Error(
    "Informe --exclude <arquivo-local.json> com a lista revisada de possíveis empresas (array de nomes, mesmo que vazio).",
  );
const excludeNames = JSON.parse(
  await readFile(process.argv[excludeAt + 1], "utf8"),
);
if (
  !Array.isArray(excludeNames) ||
  excludeNames.some((name) => typeof name !== "string")
)
  throw new Error("A lista de exclusões precisa conter somente nomes.");
const plan = planArchitects(JSON.parse(await readFile(input, "utf8")), {
  excludeNames,
});
await mkdir("test-results", { recursive: true });
await writeFile(
  "test-results/architect-import-review.local",
  JSON.stringify(plan, null, 2),
);
console.log(
  `Triagem: ${plan.contacts.length} arquitetos; ${plan.excluded.length} linhas para revisão; ${plan.duplicates} repetições consolidadas.`,
);
if (process.argv.includes("--apply")) {
  const branch = process.env.NEON_BRANCH;
  if (branch !== "production" && !branch?.startsWith("famac-e2e-"))
    throw new Error("Branch não autorizada para importação.");
  if (process.argv.includes("--production") !== (branch === "production"))
    throw new Error(
      "Confirme o destino da importação com --production somente na produção.",
    );
  const db = new pg.Client({
    connectionString: connectionString(process.env.DATABASE_URL_UNPOOLED),
  });
  await db.connect();
  let inserted = 0,
    skipped = 0;
  try {
    await db.query("BEGIN");
    await db.query(
      "SELECT value FROM famac.revision WHERE singleton=true FOR UPDATE",
    );
    const existing = (
      await db.query(
        "SELECT payload FROM famac.contacts WHERE payload->>'role'='architect'",
      )
    ).rows.map((r) => r.payload);
    for (const contact of plan.contacts) {
      validateRecord("contacts", contact);
      if (existing.some((r) => architectKey(r) === architectKey(contact))) {
        skipped++;
        continue;
      }
      if (
        existing.some(
          (r) => normalizeContact(r.name) === normalizeContact(contact.name),
        )
      )
        throw new Error(
          `Contato existente com dados divergentes: ${contact.name}. Nenhum cadastro foi sobrescrito.`,
        );
      await db.query(
        "INSERT INTO famac.contacts(id,owner_id,payload) VALUES ($1,'shared',$2)",
        [contact.id, contact],
      );
      existing.push(contact);
      inserted++;
    }
    if (inserted)
      await db.query(
        "UPDATE famac.revision SET value=value+1 WHERE singleton=true",
      );
    await db.query("COMMIT");
    console.log(
      `PASS: ${inserted} arquitetos importados na branch ${branch}; ${skipped} já existentes; nenhuma conta ou visita criada.`,
    );
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    await db.end();
  }
}
